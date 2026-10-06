using FoodBuddy.Api.Services.Places;

namespace FoodBuddy.Api.Models;

/// <summary>AI 從自然語言解析出的搜尋條件</summary>
public record SearchConditions(
    string Summary,
    string? Country,
    string? City,
    string? District,
    string? Landmark,
    IReadOnlyList<string> Cuisines,
    string? MealTime,
    int? People,
    int? BudgetPerPerson,
    IReadOnlyList<string> Keywords);

/// <summary>AI 對某間候選店家的分析（以 CandidateId 指向 OpenStreetMap 店家）</summary>
public record AiAnalysis(
    string CandidateId,
    string? PlaceType,
    IReadOnlyList<string> Cuisines,
    string? PriceRange,
    int? EstimatedPricePerPerson,
    string? Reputation,
    IReadOnlyList<string> RecommendedDishes,
    string Reason,
    IReadOnlyList<string> Pros,
    IReadOnlyList<string> Cons,
    string? SuitableFor,
    // 符合使用者口味時的具體依據，例如「你常收藏拉麵店」；沒有則為 null
    string? PreferenceReason,
    int MatchScore);

/// <summary>推薦結果：店家基本資料來自 OpenStreetMap，分析來自 AI</summary>
public record Recommendation(
    string Id,
    string Name,
    string? City,
    string? District,
    string? Address,
    double Lat,
    double Lng,
    int DistanceMeters,
    string? OpeningHours,
    string? Phone,
    string? Website,
    string? PlaceType,
    IReadOnlyList<string> Cuisines,
    string? PriceRange,
    int? EstimatedPricePerPerson,
    string? Reputation,
    IReadOnlyList<string> RecommendedDishes,
    string Reason,
    IReadOnlyList<string> Pros,
    IReadOnlyList<string> Cons,
    string? SuitableFor,
    string? PreferenceReason,
    int MatchScore);

/// <summary>前端從收藏計算的口味摘要</summary>
public record TasteProfile(
    IReadOnlyList<CuisineCount> TopCuisines,
    IReadOnlyList<string> PreferredPriceRanges,
    IReadOnlyList<string> HighRated,
    IReadOnlyList<string> DislikedCuisines,
    IReadOnlyList<string> DislikedNames,
    int TotalSaved);

public record CuisineCount(string Name, int Count);

/// <summary>前端送來的收藏（精簡欄位）</summary>
public record SavedPlaceInput(
    string Id,
    string Name,
    double? Lat,
    double? Lng,
    string? City,
    string? District,
    IReadOnlyList<string> Cuisines,
    IReadOnlyList<string> Statuses,
    double? Rating,
    string? PriceRange);

/// <summary>AI 從收藏中挑出、符合這次需求的店</summary>
public record SavedPick(string PlaceId, string Reason, int MatchScore);

public record ParseRequest(string Query);

public record ParseResponse(SearchConditions Conditions, bool Mock);

public record RecommendRequest(
    string Query,
    SearchConditions Conditions,
    IReadOnlyList<string>? ExcludeNames,
    GeoPoint? Origin,
    TasteProfile? Profile,
    IReadOnlyList<SavedPlaceInput>? SavedPlaces);

public record RecommendResponse(
    IReadOnlyList<Recommendation> Recommendations,
    IReadOnlyList<SavedPick> Saved,
    bool Mock,
    SearchArea? Area,
    int CandidateCount,
    string? Message);

public record ApiError(string Message);

/// <summary>位於搜尋範圍內、可能符合這次需求的收藏（id 為 saved/&lt;本機 id&gt;）</summary>
public record SavedCandidate(string Id, SavedPlaceInput Place, int? DistanceMeters, bool CuisineMatched)
{
    public const string IdPrefix = "saved/";
}
