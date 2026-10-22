using FoodBuddy.Api.Models;
using FoodBuddy.Api.Options;
using FoodBuddy.Api.Services;
using FoodBuddy.Api.Services.Places;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace FoodBuddy.Api.Controllers;

/// <summary>
/// 開發用：比較不同 Azure OpenAI 部署在「解析需求」與「挑店」的速度與結果。
/// 只在 Development 環境可用，正式環境一律回 404；回應中不含任何金鑰。
/// </summary>
[ApiController]
[Route("api/dev")]
public class DevController(
    IAiService ai, IPlaceSearchService places, IOptions<AzureOpenAIOptions> options, IWebHostEnvironment env) : ControllerBase
{
    static readonly string[] Queries =
    [
        "幫我找高雄左營附近，適合三個人晚餐，每人 500 元左右的日式料理。",
        "台南中西區晚上想吃牛肉湯",
        "台北信義區適合下午茶的甜點店",
    ];

    const int RankRuns = 2;

    public record ParseResult(string Query, double Seconds, int TokensIn, int TokensOut, int ReasoningTokens, SearchConditions? Conditions, string? Error);

    public record RankResult(
        string Query, double AvgSeconds, int TokensIn, int TokensOut, int ReasoningTokens,
        int Picks, IReadOnlyList<string> Names, string? FirstReason, string? Error);

    public record DeploymentResult(
        string Deployment, double AvgParseSeconds, double AvgRankSeconds,
        IReadOnlyList<ParseResult> Parse, IReadOnlyList<RankResult> Rank);

    [HttpPost("benchmark")]
    public async Task<ActionResult<IReadOnlyList<DeploymentResult>>> Benchmark(CancellationToken ct)
    {
        if (!env.IsDevelopment()) return NotFound();
        if (ai is not AzureOpenAiService azure) return BadRequest(new ApiError("目前是示範模式，沒有可比較的 Azure OpenAI 部署。"));

        var opt = options.Value;
        var deployments = new[] { opt.Deployment }.Concat(opt.BenchmarkDeployments)
            .Where(d => !string.IsNullOrWhiteSpace(d)).Distinct().ToList();

        // 先用預設部署解析一次並取得地圖候選店家，讓每個部署挑店時用同一份資料，只比較 AI
        var fixtures = new List<(string Query, SearchConditions Conditions, SearchArea Area, IReadOnlyList<PlaceCandidate> Candidates)>();
        foreach (var q in Queries)
        {
            var (c, _) = await azure.ParseWithAsync(opt.Deployment, q, ct);
            var area = await places.ResolveAreaAsync(c.Country, c.City, c.District, c.Landmark, ct)
                       ?? throw new InvalidOperationException($"找不到地點：{q}");
            fixtures.Add((q, c, area, await places.SearchAsync(area, c.Cuisines, c.Keywords, ct)));
        }

        var results = new List<DeploymentResult>();
        foreach (var d in deployments)
        {
            var parse = new List<ParseResult>();
            var rank = new List<RankResult>();
            foreach (var f in fixtures)
            {
                try
                {
                    var (c, s) = await azure.ParseWithAsync(d, f.Query, ct);
                    parse.Add(new ParseResult(f.Query, s.Seconds, s.PromptTokens, s.CompletionTokens, s.ReasoningTokens, c, null));
                }
                catch (AiServiceException ex)
                {
                    parse.Add(new ParseResult(f.Query, 0, 0, 0, 0, null, ex.Message));
                }

                try
                {
                    var runs = new List<(IReadOnlyList<AiAnalysis> Result, AzureOpenAiService.CallStats Stats)>();
                    for (var i = 0; i < RankRuns; i++)
                        runs.Add(await azure.RankWithAsync(d, f.Query, f.Conditions, f.Candidates, [], null, ct));
                    var last = runs[^1];
                    var byId = f.Candidates.ToDictionary(p => p.Id);
                    var picks = last.Result.Where(a => byId.ContainsKey(a.CandidateId)).ToList();
                    rank.Add(new RankResult(
                        f.Query,
                        Math.Round(runs.Average(r => r.Stats.Seconds), 2),
                        last.Stats.PromptTokens, last.Stats.CompletionTokens, last.Stats.ReasoningTokens,
                        picks.Count,
                        picks.Select(a => byId[a.CandidateId].Name).ToList(),
                        picks.FirstOrDefault()?.Reason,
                        null));
                }
                catch (AiServiceException ex)
                {
                    rank.Add(new RankResult(f.Query, 0, 0, 0, 0, 0, [], null, ex.Message));
                }
            }

            static double Avg(IEnumerable<double> xs) => xs.Any() ? Math.Round(xs.Average(), 2) : 0;
            results.Add(new DeploymentResult(
                d,
                Avg(parse.Where(p => p.Error is null).Select(p => p.Seconds)),
                Avg(rank.Where(r => r.Error is null).Select(r => r.AvgSeconds)),
                parse,
                rank));
        }
        return results;
    }
}
