def win_rate(segment):
    return float(segment["stats"]["Win Rate %"])


def pick_rate(seg, total):
    return round(100 * int(seg["stats"]["Matches"]) / total, 1)


def ban_rate(pick):
    return round(100 - pick, 1)


# def kdr(segment):          return float(segment["stats"]["K/D Ratio"])
# def adr(segment):          return float(segment["stats"]["ADR"])
# def kpr(segment):          return float(segment["stats"]["KPR"])
