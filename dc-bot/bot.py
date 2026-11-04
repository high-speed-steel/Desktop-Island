import os
import re
import json
import secrets
import string
import asyncio
import aiohttp
import discord
from discord.ext import commands

# ----------------- 載入共用 JSON 配置 -----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
EXAMPLE_CONFIG_PATH = os.path.join(BASE_DIR, "config.example.json")

def resolve_dir(path_str: str) -> str:
    """將相對路徑轉換為相對於 dc-bot 目錄的絕對路徑，避免依賴特定本機路徑"""
    if os.path.isabs(path_str):
        return os.path.abspath(path_str)
    return os.path.abspath(os.path.join(BASE_DIR, path_str))

def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(
            f"找不到配置檔: {CONFIG_PATH}\n"
            f"請先將 {EXAMPLE_CONFIG_PATH} 複製為 config.json 並填入您的 bot_token！"
        )
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

config = load_config()

BOT_TOKEN = config.get("bot_token", "")
SHELF_ROOT = resolve_dir(config.get("shelf_dir", "./shelf"))
TEMP_CACHE = resolve_dir(config.get("temp_cache_dir", "./temp_cache"))
ISLAND_NOTIFY_URL = config.get("island_notify_url", "http://127.0.0.1:28848/notify")
MAX_FILE_SIZE = int(config.get("max_file_size_mb", 50)) * 1024 * 1024
BUNDLE_TIMEOUT = float(config.get("bundle_timeout_seconds", 30))

os.makedirs(SHELF_ROOT, exist_ok=True)
os.makedirs(TEMP_CACHE, exist_ok=True)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

def sanitize_filename(filename: str) -> str:
    """清洗 Windows 保留字元替換為連字號 '-'"""
    name, ext = os.path.splitext(filename)
    name = re.sub(r'[\\/*?:"<>|]', '-', name).strip()
    if not name:
        name = "unnamed"
    return f"{name}{ext}"

def get_unique_path(target_dir: str, filename: str) -> str:
    """檢查同名衝突，重複時追加 6 位隨機英數"""
    name, ext = os.path.splitext(filename)
    target_path = os.path.join(target_dir, f"{name}{ext}")
    if os.path.exists(target_path):
        suffix = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(6))
        target_path = os.path.join(target_dir, f"{name}-{suffix}{ext}")
    return target_path

async def notify_island(payload: dict):
    """傳完檔案後，主動發送 HTTP POST 叫醒 Desktop Island (Rust 側)"""
    if not ISLAND_NOTIFY_URL:
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                ISLAND_NOTIFY_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=2)
            ) as resp:
                if resp.status == 200:
                    print(f"[Island] 成功通知 Island: {payload.get('type')}")
                else:
                    print(f"[Island] Island 回應異常狀態碼: {resp.status}")
    except Exception as e:
        # 若 Island 尚未啟動，不影響 Bot 正常保存檔案
        print(f"[Island] 無法連線至 Island (可能尚未啟動): {e}")

class BundleDecisionView(discord.ui.View):
    """30 秒多附件決策面板"""
    def __init__(self, temp_files: list[str], timeout: float = 30.0):
        super().__init__(timeout=timeout)
        self.temp_files = temp_files
        self.is_resolved = False

    async def move_and_finalize(self, as_bundle: bool):
        if self.is_resolved:
            return
        self.is_resolved = True

        final_paths = []
        if as_bundle:
            # 打包放入獨立子資料夾
            folder_id = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(6))
            bundle_dir = os.path.join(SHELF_ROOT, f"Bundle-{folder_id}")
            os.makedirs(bundle_dir, exist_ok=True)
            for src in self.temp_files:
                if os.path.exists(src):
                    dest = get_unique_path(bundle_dir, os.path.basename(src))
                    os.rename(src, dest)
                    final_paths.append(dest)
            
            # 叫醒 Island (打包目錄)
            await notify_island({
                "type": "bundle",
                "bundle_dir": bundle_dir,
                "files": final_paths
            })
        else:
            # 拆散平鋪至 Shelf 根目錄
            for src in self.temp_files:
                if os.path.exists(src):
                    dest = get_unique_path(SHELF_ROOT, os.path.basename(src))
                    os.rename(src, dest)
                    final_paths.append(dest)

            # 叫醒 Island (多個單檔)
            await notify_island({
                "type": "multiple_files",
                "files": final_paths
            })

        # 停用按鈕
        for item in self.children:
            item.disabled = True

    @discord.ui.button(label="📦 直接打包", style=discord.ButtonStyle.primary)
    async def bundle_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.move_and_finalize(as_bundle=True)
        await interaction.response.edit_message(content="✅ 已打包至專屬資料夾並推入暫存板！", view=self)

    @discord.ui.button(label="📄 拆散保存", style=discord.ButtonStyle.secondary)
    async def unbundle_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.move_and_finalize(as_bundle=False)
        await interaction.response.edit_message(content="✅ 已拆散平鋪存入暫存板！", view=self)

    async def on_timeout(self):
        """超過時間無回應，預設自動打包"""
        if not self.is_resolved:
            await self.move_and_finalize(as_bundle=True)

@bot.event
async def on_ready():
    print(f"========================================")
    print(f"Desktop Island Discord Bot 已就緒！")
    print(f"機器人帳號: {bot.user}")
    print(f"暫存板目錄: {SHELF_ROOT}")
    print(f"Island 通知接口: {ISLAND_NOTIFY_URL}")
    print(f"========================================")

def extract_all_attachments(message: discord.Message) -> list[discord.Attachment]:
    """收集訊息本身以及轉發（Message Snapshots / Forwarding）中的所有附件"""
    attachments = list(message.attachments)
    
    # Discord 原生轉發功能 (message_snapshots)
    snapshots = getattr(message, "message_snapshots", None)
    if snapshots:
        for snapshot in snapshots:
            if hasattr(snapshot, "attachments") and snapshot.attachments:
                attachments.extend(snapshot.attachments)

    return attachments

@bot.event
async def on_message(message: discord.Message):
    # 僅限私訊且排除機器人自身發言
    if message.author.bot or not isinstance(message.channel, discord.DMChannel):
        return

    # 提取所有附件（包含一般上傳與轉發附件）
    all_attachments = extract_all_attachments(message)
    if not all_attachments:
        return

    # 1. 篩選未超過大小上限的有效附件
    valid_attachments = []
    for att in all_attachments:
        if att.size > MAX_FILE_SIZE:
            size_mb = att.size / (1024 * 1024)
            await message.channel.send(f"⚠️ `{att.filename}` 體積超過上限 (目前 {size_mb:.1f}MB)，已略過。")
            continue
        valid_attachments.append(att)

    if not valid_attachments:
        return

    # 2. 下載有效附件至臨時快取目錄（.part 原子機制）
    downloaded_paths = []
    for att in valid_attachments:
        clean_name = sanitize_filename(att.filename)
        temp_dest = get_unique_path(TEMP_CACHE, clean_name)
        part_path = f"{temp_dest}.part"

        try:
            await att.save(part_path)
            os.rename(part_path, temp_dest)
            downloaded_paths.append(temp_dest)
        except Exception as e:
            if os.path.exists(part_path):
                try:
                    os.remove(part_path)
                except Exception:
                    pass
            await message.channel.send(f"❌ `{att.filename}` 下載失敗: {e}")

    if not downloaded_paths:
        return

    # 3. 依數量分流決策
    if len(downloaded_paths) == 1:
        # 單檔直接平鋪至 Shelf
        single_src = downloaded_paths[0]
        final_dest = get_unique_path(SHELF_ROOT, os.path.basename(single_src))
        os.rename(single_src, final_dest)
        
        # 傳完主動叫醒 Island
        await notify_island({
            "type": "single_file",
            "path": final_dest
        })
        await message.add_reaction("✅")
    else:
        # 多附件觸發決策面板
        view = BundleDecisionView(downloaded_paths, timeout=BUNDLE_TIMEOUT)
        await message.channel.send(
            f"📥 收到 {len(downloaded_paths)} 個檔案，請選擇保存方式（**{int(BUNDLE_TIMEOUT)} 秒後預設自動打包**）：",
            view=view
        )

if __name__ == "__main__":
    if not BOT_TOKEN or BOT_TOKEN == "YOUR_DISCORD_BOT_TOKEN_HERE":
        print("❌ 錯誤: 請先在 dc-bot/config.json 填入有效的 bot_token！")
    else:
        bot.run(BOT_TOKEN)
