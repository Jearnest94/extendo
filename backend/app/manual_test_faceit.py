import os
from dotenv import load_dotenv
from faceit import FaceitClient

# Load .env if present
load_dotenv()

fc = FaceitClient()

# Replace with a real Faceit player nickname or player_id
nickname = "ALTR_ABDI"

try:
    player = fc.get_player(nickname=nickname)
    print("Player info:", player)

    # Write to file
    with open("player_info.txt", "w") as f:
        f.write(str(player))

except Exception as e:
    print("Error:", e)
