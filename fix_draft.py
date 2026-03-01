code = open('src/components/DraftDisplay.jsx').read()

old = "const LANE_LABELS = { 1: \"Safe\", 2: \"Mid\", 3: \"Off\", 4: \"Jungle\", 5: \"Support\" }"

new = """const POSITION_LABELS = { 0: "Carry", 1: "Mid", 2: "Off", 3: "Soft Sup", 4: "Hard Sup" }

function getPosition(player) {
  // player_slot: 0-4 = radiant, 128-132 = dire
  const slot = player.player_slot < 128 ? player.player_slot : player.player_slot - 128
  return POSITION_LABELS[slot] || "Unknown"
}"""

code = code.replace(old, new)

# Replace lane mapping in players array
old2 = "lane: LANE_LABELS[p.lane_role] || \"Unknown\","
new2 = "lane: getPosition(p),"

code = code.replace(old2, new2)

# Update LANE_ORDER to match new position labels
old3 = 'const LANE_ORDER = { Safe: 1, Mid: 2, Off: 3, Jungle: 4, Support: 5, Unknown: 6 }'
new3 = 'const LANE_ORDER = { Carry: 1, Mid: 2, Off: 3, "Soft Sup": 4, "Hard Sup": 5, Unknown: 6 }'

code = code.replace(old3, new3)

with open('src/components/DraftDisplay.jsx', 'w') as f:
    f.write(code)

print('Done!')