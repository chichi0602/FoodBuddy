using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services;
using FoodBuddy.Api.Services.Places;
using Microsoft.AspNetCore.Mvc;

namespace FoodBuddy.Api.Controllers;

[ApiController]
[Route("api/ai")]
public class AiController(IAiService ai, RecommendationService recommender) : ControllerBase
{
    const int MaxQueryLength = 500;
    const int MaxExcludeNames = 100;

    /// <summary>把自然語言需求解析成結構化條件</summary>
    [HttpPost("parse")]
    public async Task<ActionResult<ParseResponse>> Parse(ParseRequest request, CancellationToken ct)
    {
        if (Validate(request.Query) is { } error) return error;
        try
        {
            var conditions = await ai.ParseAsync(request.Query.Trim(), ct);
            return new ParseResponse(conditions, ai.IsMock);
        }
        catch (AiServiceException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new ApiError(ex.Message));
        }
    }

    /// <summary>從 OpenStreetMap 取得範圍內的真實店家，再由 AI 挑選與分析</summary>
    [HttpPost("recommend")]
    public async Task<ActionResult<RecommendResponse>> Recommend(RecommendRequest request, CancellationToken ct)
    {
        if (Validate(request.Query) is { } error) return error;
        if (request.Origin is { } o && (Math.Abs(o.Lat) > 90 || Math.Abs(o.Lng) > 180))
            return BadRequest(new ApiError("定位座標不正確。"));

        var exclude = (request.ExcludeNames ?? []).Where(n => !string.IsNullOrWhiteSpace(n)).Take(MaxExcludeNames).ToList();
        try
        {
            return await recommender.RecommendAsync(request with { Query = request.Query.Trim(), ExcludeNames = exclude }, ct);
        }
        catch (RecommendationException ex)
        {
            return BadRequest(new ApiError(ex.Message));
        }
        catch (Exception ex) when (ex is AiServiceException or PlaceSearchException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new ApiError(ex.Message));
        }
    }

    /// <summary>首頁「為你推薦」：依口味推薦還沒去過的店</summary>
    [HttpPost("for-you")]
    public async Task<ActionResult<RecommendResponse>> ForYou(ForYouRequest request, CancellationToken ct)
    {
        if (request.Origin is { } o && (Math.Abs(o.Lat) > 90 || Math.Abs(o.Lng) > 180))
            return BadRequest(new ApiError("定位座標不正確。"));
        try
        {
            return await recommender.ForYouAsync(request, ct);
        }
        catch (RecommendationException ex)
        {
            return BadRequest(new ApiError(ex.Message));
        }
        catch (Exception ex) when (ex is AiServiceException or PlaceSearchException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new ApiError(ex.Message));
        }
    }

    /// <summary>依收藏與到訪紀錄分析口味</summary>
    [HttpPost("taste-insight")]
    public async Task<ActionResult<TasteInsightResponse>> TasteInsight(TasteInsightRequest request, CancellationToken ct)
    {
        if (request.Stats.TotalSaved == 0)
            return BadRequest(new ApiError("還沒有任何收藏，先存幾間店再來分析口味吧。"));
        // 只送最近 100 筆，控制 token 數
        var trimmed = request with { Visits = request.Visits.Take(100).ToList() };
        try
        {
            return new TasteInsightResponse(await ai.AnalyzeTasteAsync(trimmed, ct), ai.IsMock);
        }
        catch (AiServiceException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new ApiError(ex.Message));
        }
    }

    ActionResult? Validate(string? query)
    {
        if (string.IsNullOrWhiteSpace(query)) return BadRequest(new ApiError("請輸入想找的美食條件。"));
        if (query.Length > MaxQueryLength) return BadRequest(new ApiError($"需求描述請在 {MaxQueryLength} 字以內。"));
        return null;
    }
}
