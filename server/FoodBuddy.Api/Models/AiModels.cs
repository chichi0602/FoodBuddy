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
    int MatchScore);

public record ParseRequest(string Query);

public record ParseResponse(SearchConditions Conditions, bool Mock);

public record RecommendRequest(
    string Query, SearchConditions Conditions, IReadOnlyList<string>? ExcludeNames, GeoPoint? Origin);

public record RecommendResponse(
    IReadOnlyList<Recommendation> Recommendations,
    bool Mock,
    SearchArea? Area,
    int CandidateCount,
    string? Message);

public record ApiError(string Message);
