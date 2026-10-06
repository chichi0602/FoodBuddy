using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FoodBuddy.Api.Controllers;

[ApiController]
[Route("api/ai")]
public class AiController(IAiService ai) : ControllerBase
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

    /// <summary>依條件推薦店家</summary>
    [HttpPost("recommend")]
    public async Task<ActionResult<RecommendResponse>> Recommend(RecommendRequest request, CancellationToken ct)
    {
        if (Validate(request.Query) is { } error) return error;
        var exclude = (request.ExcludeNames ?? []).Where(n => !string.IsNullOrWhiteSpace(n)).Take(MaxExcludeNames).ToList();
        try
        {
            var items = await ai.RecommendAsync(request.Query.Trim(), request.Conditions, exclude, ct);
            return new RecommendResponse(items, ai.IsMock);
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
