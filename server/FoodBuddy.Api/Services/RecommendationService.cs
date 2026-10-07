using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Services;

/// <summary>
/// 推薦流程：決定搜尋範圍 → 從 OpenStreetMap 取得真實店家 → 交給 AI 挑選分析 → 合併。
/// AI 只能以 id 指定候選店家，不在清單中的結果一律丟棄，確保不會出現虛構的店。
/// </summary>
public class RecommendationService(
    IPlaceSearchService places, IAiService ai, TimeProvider clock, ILogger<RecommendationService> logger)
{
    public const string OriginLabel = "目前位置";
    const int OriginRadiusMeters = 1500;
    const int MaxResults = 5;
    const int MaxSavedCandidates = 20;
    const double SavedRadiusFactor = 1.2;

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

        var allSaved = request.SavedPlaces ?? [];
        var saved = SelectSaved(allSaved, area, c, request.OnlyUnvisitedSaved);

        // 已在收藏裡的店（包含不推薦）不再當成新店推薦
        var exclude = (request.ExcludeNames ?? []).ToHashSet();
        var excludeIds = (request.ExcludeIds ?? []).ToHashSet();
        var candidates = (await places.SearchAsync(area, c.Cuisines, c.Keywords, ct))
            .Where(p => !exclude.Contains(p.Name) && !excludeIds.Contains(p.Id))
            .Where(p => !allSaved.Any(s => AreaMatcher.IsSamePlace(s.Name, s.Lat, s.Lng, p.Name, p.Lat, p.Lng)))
            .ToList();

        if (candidates.Count == 0 && saved.Count == 0)
            return new RecommendResponse([], [], ai.IsMock, area, 0, "OpenStreetMap 在這個範圍內沒有找到餐飲店家，試試附近其他地點。");

        var analyses = await ai.RankAsync(request.Query, c, candidates, saved, request.Profile, ct);
        var byId = candidates.ToDictionary(p => p.Id);
        var savedById = saved.ToDictionary(s => s.Id);
        var invalid = analyses.Count(a => !byId.ContainsKey(a.CandidateId) && !savedById.ContainsKey(a.CandidateId));
        if (invalid > 0) logger.LogWarning("AI returned {Count} ids not in the candidate lists; discarded", invalid);

        var now = clock.GetUtcNow();
        var picks = analyses.DistinctBy(a => a.CandidateId).OrderByDescending(a => a.MatchScore).ToList();
        var results = picks
            .Where(a => byId.ContainsKey(a.CandidateId))
            // 連鎖店的不同分店只留分數最高的一間
            .DistinctBy(a => AreaMatcher.NormalizeName(byId[a.CandidateId].Name))
            .Take(MaxResults)
            .Select(a => Merge(byId[a.CandidateId], a, c, area, request.Profile, now))
            // 依 Recommendation Score 排序
            .OrderByDescending(r => r.Score)
            .ToList();
        var savedPicks = picks
            .Where(a => savedById.ContainsKey(a.CandidateId))
            .Take(MaxResults)
            .Select(a => new SavedPick(savedById[a.CandidateId].Place.Id, a.Reason, Math.Clamp(a.MatchScore, 0, 100)))
            .ToList();
        // 為你推薦：範圍內還沒去的收藏全部列出（AI 有挑中的排前面、附 AI 評語），
        // 因為需求是泛用的「推薦我可能會喜歡的店」，AI 不一定會挑收藏
        if (request.OnlyUnvisitedSaved)
        {
            var picked = savedPicks.Select(s => s.PlaceId).ToHashSet();
            savedPicks.AddRange(saved
                .Where(s => !picked.Contains(s.Place.Id))
                .Select(s => new SavedPick(s.Place.Id, UnvisitedNote(s), 0)));
            savedPicks = savedPicks.Take(MaxResults).ToList();
        }

        var note = results.Count switch
        {
            0 => "地圖資料中沒有找到符合條件的店。可以放寬條件、換個說法，或換個地點試試。",
            < MaxResults => $"範圍內符合條件的店家較少，只找到 {results.Count} 間。可以放寬條件或換個地點。",
            _ => null,
        };
        return new RecommendResponse(results, savedPicks, ai.IsMock, area, candidates.Count, note);
    }

    /// <summary>
    /// 找出位於搜尋範圍內的收藏：有座標的看距離，沒有座標的比對城市與行政區。
    /// 不推薦的店不列入；料理相符者優先。
    /// </summary>
    static List<SavedCandidate> SelectSaved(
        IReadOnlyList<SavedPlaceInput> all, SearchArea area, SearchConditions c, bool onlyUnvisited)
    {
        var maxDistance = area.RadiusMeters * SavedRadiusFactor;
        var wanted = c.Cuisines.Concat(c.Keywords).Where(w => w.Length > 0).ToList();
        var result = new List<SavedCandidate>();
        foreach (var p in all)
        {
            if (p.Statuses.Contains("notRecommended")) continue;
            if (onlyUnvisited && p.Statuses.Contains("visited")) continue;

            int? distance = null;
            if (p.Lat is { } lat && p.Lng is { } lng)
            {
                distance = (int)Math.Round(OsmPlaceSearchService.DistanceMeters(area.Lat, area.Lng, lat, lng));
                if (distance > maxDistance) continue;
            }
            else
            {
                // 定位搜尋沒有地名可比，沒有座標的收藏無法判斷是否在附近
                if (area.Label == OriginLabel) continue;
                var hasArea = !string.IsNullOrWhiteSpace(c.City) || !string.IsNullOrWhiteSpace(c.District);
                if (!hasArea || !AreaMatcher.SameArea(c.City, p.City) || !AreaMatcher.SameArea(c.District, p.District)) continue;
            }

            var matched = wanted.Count > 0 &&
                          wanted.Any(w => p.Cuisines.Contains(w) || p.Name.Contains(w, StringComparison.OrdinalIgnoreCase));
            result.Add(new SavedCandidate(SavedCandidate.IdPrefix + p.Id, p, distance, matched));
        }
        return result
            .OrderByDescending(s => s.CuisineMatched)
            .ThenBy(s => s.DistanceMeters ?? int.MaxValue)
            .Take(MaxSavedCandidates)
            .ToList();
    }

    static Recommendation Merge(
        PlaceCandidate p, AiAnalysis a, SearchConditions c, SearchArea area, TasteProfile? profile, DateTimeOffset now)
    {
        var (score, breakdown) = RecommendationScorer.Score(a, p, c, area, profile, now);
        return new Recommendation(
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
        PreferenceReason: string.IsNullOrWhiteSpace(a.PreferenceReason) ? null : a.PreferenceReason,
        MatchScore: Math.Clamp(a.MatchScore, 0, 100),
        Score: score,
        ScoreBreakdown: breakdown);
    }

    static string UnvisitedNote(SavedCandidate s)
    {
        var where = s.DistanceMeters is { } d ? $"距離約 {(d < 1000 ? $"{d} 公尺" : $"{d / 1000.0:0.0} 公里")}" : "在這個地區";
        var status = s.Place.Statuses.Contains("wantToGo") ? "想去" : "收藏";
        return $"你標了「{status}」還沒去過，{where}。";
    }

    /// <summary>為你推薦：以口味前 3 名料理為條件，重用一般推薦流程</summary>
    public Task<RecommendResponse> ForYouAsync(ForYouRequest r, CancellationToken ct)
    {
        if (r.Profile is not { TopCuisines.Count: > 0 } profile)
            throw new RecommendationException("收藏至少 3 間喜歡的店之後，才能依你的口味推薦。");

        // 只取有份量的料理（權重 ≥ 2），避免同分的冷門料理被帶進條件；至少保留第一名
        var cuisines = profile.TopCuisines.Where(t => t.Count >= 2).Take(3).Select(t => t.Name).ToList();
        if (cuisines.Count == 0) cuisines = [profile.TopCuisines[0].Name];
        var conditions = new SearchConditions(
            Summary: $"依你的口味（{string.Join("、", cuisines)}）推薦可能會喜歡、還沒去過的店",
            Country: null, City: r.City, District: r.District, Landmark: null,
            Cuisines: cuisines, MealTime: null, People: null, BudgetPerPerson: null, Keywords: []);
        var query = $"根據我的收藏，推薦 5 間我可能會喜歡但還沒去過的店。我最常收藏的料理是：{string.Join("、", cuisines)}。";

        return RecommendAsync(new RecommendRequest(
            query, conditions, r.ExcludeNames, r.Origin, profile, r.SavedPlaces, r.ExcludeIds, OnlyUnvisitedSaved: true), ct);
    }
}

/// <summary>推薦流程無法進行（例如沒有地點）；Message 直接顯示給使用者</summary>
public class RecommendationException(string message) : Exception(message);
