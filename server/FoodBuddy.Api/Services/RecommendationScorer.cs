using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

/// <summary>
/// Recommendation Score（Agenda 第 14 節）：用固定公式把 AI 的判斷與可量化的條件合成一個 0～100 的分數。
/// 每一項都附上給使用者看的說明，畫面可以展開明細。
/// </summary>
public static class RecommendationScorer
{
    /// <summary>口味排名第 1～5 名的料理可得的分數</summary>
    static readonly int[] TasteRankPoints = [20, 16, 12, 8, 6];

    static readonly string[] PriceOrder = ["under200", "200to500", "500to1000", "over1000"];

    /// <summary>指定用餐時段時，用這個代表時間判斷是否營業</summary>
    static readonly Dictionary<string, (int Hour, int Minute, string Label)> MealTimes = new()
    {
        ["breakfast"] = (8, 0, "早餐"),
        ["lunch"] = (12, 30, "午餐"),
        ["teatime"] = (15, 0, "下午茶"),
        ["dinner"] = (18, 30, "晚餐"),
        ["lateNight"] = (22, 30, "宵夜"),
    };

    static readonly TimeSpan TaiwanOffset = TimeSpan.FromHours(8);

    public static (int Score, IReadOnlyList<ScoreItem> Breakdown) Score(
        AiAnalysis a, PlaceCandidate p, SearchConditions c, SearchArea area, TasteProfile? profile, DateTimeOffset now)
    {
        var items = new List<ScoreItem>
        {
            Match(a),
            Taste(a, profile),
            Distance(p, area),
            Price(a, c, profile),
            Hours(p, c, now),
            new("fresh", "新發現", 5, 5, "你還沒收藏過這間店"),
        };
        return (items.Sum(i => i.Points), items);
    }

    static ScoreItem Match(AiAnalysis a)
    {
        var score = Math.Clamp(a.MatchScore, 0, 100);
        return new("match", "需求符合度", (int)Math.Round(score * 0.4), 40, $"AI 判斷符合這次需求的程度 {score}/100");
    }

    static ScoreItem Taste(AiAnalysis a, TasteProfile? profile)
    {
        if (profile is null || profile.TopCuisines.Count == 0)
            return new("taste", "口味契合", 10, 20, "收藏還不夠多，看不出口味，給中間分數");

        var rank = profile.TopCuisines
            .Select((t, i) => (t.Name, Index: i))
            .Where(t => a.Cuisines.Contains(t.Name))
            .Select(t => t.Index)
            .DefaultIfEmpty(-1)
            .Min();
        var points = rank >= 0 && rank < TasteRankPoints.Length ? TasteRankPoints[rank] : 0;
        var note = rank >= 0 ? $"「{profile.TopCuisines[rank].Name}」是你第 {rank + 1} 常收藏的料理" : "和你常收藏的料理不同";
        if (!string.IsNullOrWhiteSpace(a.PreferenceReason) && points < 12)
        {
            points = 12;
            note = "AI 判斷符合你的口味";
        }
        return new("taste", "口味契合", points, 20, note);
    }

    static ScoreItem Distance(PlaceCandidate p, SearchArea area)
    {
        var ratio = area.RadiusMeters <= 0 ? 0 : (double)p.DistanceMeters / area.RadiusMeters;
        var points = (int)Math.Round(15 * Math.Clamp(1 - ratio, 0, 1));
        var text = p.DistanceMeters < 1000 ? $"{p.DistanceMeters} 公尺" : $"{p.DistanceMeters / 1000.0:0.0} 公里";
        return new("distance", "距離", points, 15, $"距離搜尋中心約 {text}");
    }

    static ScoreItem Price(AiAnalysis a, SearchConditions c, TasteProfile? profile)
    {
        var range = a.PriceRange ?? (a.EstimatedPricePerPerson is { } est ? RangeOf(est) : null);
        if (range is null) return new("price", "價位", 5, 10, "價格不明，給中間分數");

        if (c.BudgetPerPerson is { } budget)
        {
            var gap = Math.Abs(Array.IndexOf(PriceOrder, range) - Array.IndexOf(PriceOrder, RangeOf(budget)));
            return gap switch
            {
                0 => new("price", "價位", 10, 10, $"符合每人約 ${budget} 的預算"),
                1 => new("price", "價位", 5, 10, "和預算差一個價位區間"),
                _ => new("price", "價位", 0, 10, "和預算差距較大"),
            };
        }

        if (profile is { PreferredPriceRanges.Count: > 0 })
            return profile.PreferredPriceRanges.Contains(range)
                ? new("price", "價位", 10, 10, "是你常去的價位")
                : new("price", "價位", 4, 10, "不是你常去的價位");
        return new("price", "價位", 5, 10, "沒有指定預算");
    }

    static ScoreItem Hours(PlaceCandidate p, SearchConditions c, DateTimeOffset now)
    {
        var local = now.ToOffset(TaiwanOffset).DateTime;
        var when = "現在";
        if (c.MealTime is { } meal && MealTimes.TryGetValue(meal, out var t))
        {
            local = local.Date.AddHours(t.Hour).AddMinutes(t.Minute);
            when = $"今天{t.Label}時段";
        }

        return OpeningHours.IsOpen(p.OpeningHours, local) switch
        {
            true => new("hours", "營業時間", 10, 10, $"{when}有營業"),
            false => new("hours", "營業時間", 0, 10, $"{when}沒有營業"),
            null => new("hours", "營業時間", 5, 10, "地圖資料沒有營業時間，給中間分數"),
        };
    }

    static string RangeOf(int perPerson) =>
        perPerson < 200 ? "under200" : perPerson <= 500 ? "200to500" : perPerson <= 1000 ? "500to1000" : "over1000";
}
