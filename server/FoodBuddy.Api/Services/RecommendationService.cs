using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

/// <summary>
/// 推薦流程：決定搜尋範圍 → 從 OpenStreetMap 取得真實店家 → 交給 AI 挑選分析 → 合併。
/// AI 只能以 id 指定候選店家，不在清單中的結果一律丟棄，確保不會出現虛構的店。
/// </summary>
public class RecommendationService(IPlaceSearchService places, IAiService ai, ILogger<RecommendationService> logger)
{
    public const string OriginLabel = "目前位置";
    const int OriginRadiusMeters = 1500;
    const int MaxResults = 5;

    public async Task<RecommendResponse> RecommendAsync(RecommendRequest request, CancellationToken ct)
    {
        var c = request.Conditions;
        var hasPlace = !string.IsNullOrWhiteSpace(c.City) || !string.IsNullOrWhiteSpace(c.District) || !string.IsNullOrWhiteSpace(c.Landmark);

        SearchArea? area = null;
        if (hasPlace) area = await places.ResolveAreaAsync(c.Country, c.City, c.District, c.Landmark, ct);
        if (area is null && request.Origin is { } o) area = new SearchArea(o.Lat, o.Lng, OriginLabel, OriginRadiusMeters);
        if (area is null)
        {
            var message = hasPlace
                ? $"找不到「{c.Landmark ?? c.District ?? c.City}」這個地點，請換個說法或加上城市名稱。"
                : "請在需求中加上地點，或允許瀏覽器定位以搜尋附近的店。";
            throw new RecommendationException(message);
        }

        var exclude = (request.ExcludeNames ?? []).ToHashSet();
        var candidates = (await places.SearchAsync(area, c.Cuisines, c.Keywords, ct))
            .Where(p => !exclude.Contains(p.Name))
            .ToList();

        if (candidates.Count == 0)
            return new RecommendResponse([], ai.IsMock, area, 0, "OpenStreetMap 在這個範圍內沒有找到餐飲店家，試試附近其他地點。");

        var analyses = await ai.RankAsync(request.Query, c, candidates, ct);
        var byId = candidates.ToDictionary(p => p.Id);
        var invalid = analyses.Count(a => !byId.ContainsKey(a.CandidateId));
        if (invalid > 0) logger.LogWarning("AI returned {Count} ids not in the candidate list; discarded", invalid);

        var results = analyses
            .Where(a => byId.ContainsKey(a.CandidateId))
            .DistinctBy(a => a.CandidateId)
            .OrderByDescending(a => a.MatchScore)
            .Take(MaxResults)
            .Select(a => Merge(byId[a.CandidateId], a, c, area))
            .ToList();

        var note = results.Count switch
        {
            0 => "地圖資料中沒有找到符合條件的店。可以放寬條件、換個說法，或換個地點試試。",
            < MaxResults => $"範圍內符合條件的店家較少，只找到 {results.Count} 間。可以放寬條件或換個地點。",
            _ => null,
        };
        return new RecommendResponse(results, ai.IsMock, area, candidates.Count, note);
    }

    static Recommendation Merge(PlaceCandidate p, AiAnalysis a, SearchConditions c, SearchArea area) => new(
        Id: p.Id,
        Name: p.Name,
        // 以 OSM 位置為準；地區沿用使用者指定的城市與行政區（定位搜尋時為空）
        City: area.Label == OriginLabel ? null : c.City,
        District: area.Label == OriginLabel ? null : c.District,
        Address: p.Address,
        Lat: p.Lat,
        Lng: p.Lng,
        DistanceMeters: p.DistanceMeters,
        OpeningHours: p.OpeningHours,
        Phone: p.Phone,
        Website: p.Website,
        PlaceType: a.PlaceType,
        Cuisines: a.Cuisines,
        PriceRange: a.PriceRange,
        EstimatedPricePerPerson: a.EstimatedPricePerPerson,
        Reputation: a.Reputation,
        RecommendedDishes: a.RecommendedDishes,
        Reason: a.Reason,
        Pros: a.Pros,
        Cons: a.Cons,
        SuitableFor: a.SuitableFor,
        MatchScore: Math.Clamp(a.MatchScore, 0, 100));
}

/// <summary>推薦流程無法進行（例如沒有地點）；Message 直接顯示給使用者</summary>
public class RecommendationException(string message) : Exception(message);
