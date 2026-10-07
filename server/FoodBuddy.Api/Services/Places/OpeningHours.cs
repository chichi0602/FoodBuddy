using System.Text.RegularExpressions;

namespace FoodBuddy.Api.Services.Places;

/// <summary>
/// 解析 OpenStreetMap 的 opening_hours 常見寫法，判斷某個時間是否營業。
/// 支援：<c>24/7</c>、<c>Mo-Fr 11:00-14:00,17:00-21:00; Sa,Su 11:00-21:00</c>、<c>Mo off</c>、跨午夜（<c>17:00-02:00</c>、<c>-00:00</c>）。
/// 後面的規則覆蓋前面同一天的規則（OSM 的語意）。遇到不支援的寫法（月份、節日例外、日出等）回傳 null，不猜。
/// </summary>
public static partial class OpeningHours
{
    static readonly string[] DayCodes = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

    record Rule(bool[] Days, List<(int Start, int End)> Intervals, bool Off);

    /// <summary>local 為店家當地時間；無法判斷時回傳 null</summary>
    public static bool? IsOpen(string? spec, DateTime local)
    {
        if (string.IsNullOrWhiteSpace(spec)) return null;
        if (spec.Trim() == "24/7") return true;

        var rules = Parse(spec);
        if (rules is null || rules.Count == 0) return null;

        var minute = local.Hour * 60 + local.Minute;
        var today = DayIndex(local.DayOfWeek);
        var yesterday = (today + 6) % 7;

        // 今天的時段，或昨天延續過午夜的時段
        return Covers(EffectiveRule(rules, today), minute) || Covers(EffectiveRule(rules, yesterday), minute + 1440);
    }

    static bool Covers(Rule? rule, int minute) =>
        rule is { Off: false } && rule.Intervals.Any(i => minute >= i.Start && minute < i.End);

    static Rule? EffectiveRule(List<Rule> rules, int day) => rules.LastOrDefault(r => r.Days[day]);

    static List<Rule>? Parse(string spec)
    {
        var rules = new List<Rule>();
        foreach (var raw in spec.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            var m = RulePattern().Match(raw);
            if (!m.Success) return null;

            var days = new bool[7];
            var dayText = m.Groups["days"].Value;
            if (string.IsNullOrWhiteSpace(dayText))
            {
                Array.Fill(days, true);
            }
            else
            {
                var hasWeekday = false;
                foreach (var token in dayText.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
                {
                    if (token == "PH") continue; // 國定假日例外無法判斷，略過
                    var range = token.Split('-');
                    var from = Array.IndexOf(DayCodes, range[0]);
                    var to = range.Length > 1 ? Array.IndexOf(DayCodes, range[1]) : from;
                    if (from < 0 || to < 0) return null;
                    // 支援跨週末的範圍，例如 Fr-Mo
                    for (var d = from; ; d = (d + 1) % 7)
                    {
                        days[d] = true;
                        hasWeekday = true;
                        if (d == to) break;
                    }
                }
                if (!hasWeekday) continue; // 只有 PH 的規則
            }

            var rest = m.Groups["rest"].Value.Trim();
            if (rest is "off" or "closed")
            {
                rules.Add(new Rule(days, [], true));
                continue;
            }

            var intervals = new List<(int, int)>();
            foreach (var part in rest.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                var t = TimePattern().Match(part);
                if (!t.Success) return null;
                var start = ToMinutes(t.Groups["sh"].Value, t.Groups["sm"].Value);
                var end = ToMinutes(t.Groups["eh"].Value, t.Groups["em"].Value);
                if (end <= start) end += 1440; // 跨午夜
                intervals.Add((start, end));
            }
            if (intervals.Count == 0) return null;
            rules.Add(new Rule(days, intervals, false));
        }
        return rules;
    }

    static int ToMinutes(string h, string m) => int.Parse(h) * 60 + int.Parse(m);

    static int DayIndex(DayOfWeek d) => d == DayOfWeek.Sunday ? 6 : (int)d - 1;

    [GeneratedRegex(@"^(?<days>(?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(?<rest>.+)$")]
    private static partial Regex RulePattern();

    [GeneratedRegex(@"^(?<sh>\d{1,2}):(?<sm>\d{2})\s*-\s*(?<eh>\d{1,2}):(?<em>\d{2})\+?$")]
    private static partial Regex TimePattern();
}
