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

/// <summary>AI 推薦的店家與分析</summary>
public record Recommendation(
    string Name,
    string? City,
    string? District,
    string? Address,
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

public record RecommendRequest(string Query, SearchConditions Conditions, IReadOnlyList<string>? ExcludeNames);

public record RecommendResponse(IReadOnlyList<Recommendation> Recommendations, bool Mock);

public record ApiError(string Message);
