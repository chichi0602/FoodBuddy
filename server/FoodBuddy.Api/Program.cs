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

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthorization();

// aiConfigured 只回報 Azure OpenAI 設定是否齊全，不回傳任何金鑰內容
app.MapGet("/api/health", (IConfiguration config) =>
{
    var ai = config.GetSection("AzureOpenAI");
    var aiConfigured = new[] { "Endpoint", "ApiKey", "Deployment" }.All(k => !string.IsNullOrWhiteSpace(ai[k]));
    return Results.Ok(new { status = "ok", aiConfigured });
});
app.MapControllers();

app.Run();
