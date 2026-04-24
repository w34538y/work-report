import json, os, datetime, urllib.parse

tag      = os.environ["TAG"]
repo     = os.environ["REPO"]
version  = tag.lstrip("v")
base_url = f"https://github.com/{repo}/releases/download/{tag}"
mac_tar  = os.environ["MAC_TAR"]
win_zip  = os.environ["WIN_ZIP"]

mac_file = os.path.basename(mac_tar)
win_file = os.path.basename(win_zip)

mac_sig = open(mac_tar + ".sig").read().strip()
win_sig = open(win_zip + ".sig").read().strip()

mac_url  = base_url + "/" + urllib.parse.quote(mac_file)
win_url  = base_url + "/" + urllib.parse.quote(win_file)
pub_date = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

payload = {
    "version": version,
    "notes": f"전체 변경사항: https://github.com/{repo}/releases/tag/{tag}",
    "pub_date": pub_date,
    "platforms": {
        "darwin-aarch64": {"signature": mac_sig, "url": mac_url},
        "windows-x86_64": {"signature": win_sig, "url": win_url},
    },
}

with open("latest.json", "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print("=== latest.json ===")
print(open("latest.json").read())
