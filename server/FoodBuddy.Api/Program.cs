using FoodBuddy.Api.Options;
using FoodBuddy.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());
});

// Azure OpenAI 金鑰從 User Secrets 讀取；未設定時改用示範資料
var aiSection = builder.Configuration.GetSection(AzureOpenAIOptions.SectionName);
builder.Services.Configure<AzureOpenAIOptions>(aiSection);
var aiOptions = aiSection.Get<AzureOpenAIOptions>() ?? new AzureOpenAIOptions();
if (aiOptions.IsConfigured)
{
    // gpt-5 推理模型產生推薦可能需要數十秒
    builder.Services.AddHttpClient<IAiService, AzureOpenAiService>(c => c.Timeout = TimeSpan.FromSeconds(90));
}
else
{
    builder.Services.AddSingleton<IAiService, MockAiService>();
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthorization();

// aiConfigured 只回報 Azure OpenAI 設定是否齊全，不回傳任何金鑰內容
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", aiConfigured = aiOptions.IsConfigured }));
app.MapControllers();

app.Run();
