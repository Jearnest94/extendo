def win_rate(segment):
    return float(segment["stats"]["Win Rate %"])


def pick_rate(seg, total):
    return round(100 * int(seg["stats"]["Matches"]) / total, 1)


def ban_rate(pick):
    return round(100 - pick, 1)


def kdr(segment):
    """Extract K/D ratio from segment stats"""
    return float(segment["stats"].get("K/D Ratio") or segment["stats"].get("K/D") or "0")

def adr(segment):
    """Extract Average Damage per Round from segment stats"""
    return float(segment["stats"].get("Average Damage per Round") or segment["stats"].get("ADR") or "0")

def kpr(segment):
    """Extract Kills Per Round from segment stats"""
    return float(segment["stats"].get("KPR") or segment["stats"].get("Average Kills per Round") or "0")
