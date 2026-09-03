$ErrorActionPreference = 'Stop'

$R = 'F:\R-4.6.0\bin\x64\Rscript.exe'
$S = 'C:\Users\loria\Documents\Codex\2026-07-01\new-chat\work\run_pmwg_resource_pool_hr3_clean_20260727.R'
$I = 'F:\足球实验数据\分析输出\PMwG_66人真实第二红框截止点输入_20260730'
$O = 'F:\足球实验数据\分析输出\MOT_DRT_PMWG_HR3_真实截止点加速完整版_20260730'

$env:PMWG_OUT = $O
$env:PMWG_MOT_CSV = Join-Path $I 'PMwG_66人_MOT输入_沿用已质控.csv'
$env:PMWG_DRT_CSV = Join-Path $I 'PMwG_66人_DRT输入_真实截止点.csv'
$env:PMWG_GROUP_CSV = Join-Path $I 'PMwG_66人_心率三组输入_沿用已质控.csv'
$env:PMWG_N_CORES = '12'

function Wait-ForCheckpoint([string]$Name) {
    $target = Join-Path $O $Name
    while (-not (Test-Path -LiteralPath $target)) {
        Start-Sleep -Seconds 60
    }
}

function Run-Stage([string]$Stage) {
    $log = Join-Path $O ("auto_" + $Stage + ".log")
    & $R --vanilla $S $Stage full 1>> $log 2>> $log
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        throw ("PMwG stage failed: " + $Stage)
    }
}

Wait-ForCheckpoint 'checkpoint_burn.rds'
if (-not (Test-Path -LiteralPath (Join-Path $O 'checkpoint_adapt.rds'))) {
    Run-Stage 'adapt'
}
if (-not (Test-Path -LiteralPath (Join-Path $O 'checkpoint_sample.rds'))) {
    Run-Stage 'sample'
}
if (-not (Test-Path -LiteralPath (Join-Path $O 'PMwG_posterior_group_summary.csv'))) {
    Run-Stage 'postprocess'
}
