#!/usr/bin/env Rscript

# Clean-encoding, resumable three-stage PMwG resource-pool model.
# Group code: 0 = athlete, 1 = non-athlete high HR, 2 = non-athlete low HR.
# The group effects enter the joint likelihood, not only post-processing.

suppressPackageStartupMessages({
  library(pmwg)
  library(MASS)
  library(mvtnorm)
})

root <- Sys.getenv("FOOTBALL_ROOT", unset = "F:/足球实验数据")
analysis_dir <- Sys.getenv("FOOTBALL_ANALYSIS_DIR", unset = file.path(root, "分析输出"))
out_dir <- Sys.getenv("PMWG_OUT", unset = file.path(analysis_dir, "MOT_DRT_PMWG_HR3_full_20260729_grouped"))
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

args <- commandArgs(trailingOnly = TRUE)
phase <- if (length(args) >= 1) args[[1]] else "prepare"
mode <- if (length(args) >= 2) args[[2]] else "full"
valid_phases <- c("prepare", "burn", "adapt", "sample", "postprocess")
if (!phase %in% valid_phases) stop("phase must be: ", paste(valid_phases, collapse = ", "))
if (!mode %in% c("pilot", "full")) stop("mode must be pilot or full")

read_csv_safe <- function(path) {
  for (enc in c("UTF-8-BOM", "UTF-8", "GB18030")) {
    z <- tryCatch(read.csv(path, fileEncoding = enc, stringsAsFactors = FALSE,
                            check.names = FALSE), error = function(e) NULL)
    if (!is.null(z)) return(z)
  }
  stop("Cannot read CSV: ", path)
}

csv_header <- function(path) {
  tryCatch(names(read.csv(path, nrows = 1, fileEncoding = "UTF-8-BOM",
                          check.names = FALSE)), error = function(e) character())
}

find_csv <- function(required, optional = character()) {
  files <- list.files(analysis_dir, pattern = "\\.csv$", recursive = TRUE, full.names = TRUE)
  for (f in files) {
    h <- csv_header(f)
    if (all(required %in% h) && (length(optional) == 0 || any(optional %in% h))) return(f)
  }
  stop("Cannot find CSV with columns: ", paste(required, collapse = ", "))
}

stage_std <- function(x) {
  y <- tolower(trimws(as.character(x)))
  out <- rep(NA_character_, length(y))
  # Build Chinese protocol labels from Unicode code points. This avoids relying
  # on the Windows console/source encoding when a fresh R process reads CSVs.
  cn_rest <- intToUtf8(c(0x9759, 0x606f))
  cn_ex1 <- intToUtf8(c(0x8fd0, 0x52a8, 0x4e2d))
  cn_ex2 <- intToUtf8(c(0x8fd0, 0x52a8, 0x540e))
  out[grepl(cn_rest, y, fixed = TRUE)] <- "rest"
  out[grepl(cn_ex1, y, fixed = TRUE)] <- "exercise1"
  out[grepl(cn_ex2, y, fixed = TRUE)] <- "exercise2"
  out[grepl("rest|pre", y, perl = TRUE) | grepl("静息", y, fixed = TRUE)] <- "rest"
  out[grepl("exercise.?1|post.?1", y, perl = TRUE) | grepl("第一次运动", y, fixed = TRUE)] <- "exercise1"
  out[grepl("exercise.?2|post.?2", y, perl = TRUE) | grepl("第二次运动", y, fixed = TRUE)] <- "exercise2"
  if (sum(!is.na(out)) < 0.5 * length(y)) {
    u <- unique(y[!is.na(y) & nzchar(y)])
    if (length(u) == 3) for (i in seq_along(u)) out[y == u[i]] <- c("rest", "exercise1", "exercise2")[i]
  }
  out
}

group_code <- function(x) {
  y <- trimws(as.character(x))
  non <- grepl("non.?athlete", y, ignore.case = TRUE, perl = TRUE) | grepl("非运动员", y, fixed = TRUE)
  high <- grepl("high.?hr|high.?heart", y, ignore.case = TRUE, perl = TRUE) | grepl("高心率", y, fixed = TRUE)
  low <- grepl("low.?hr|low.?heart", y, ignore.case = TRUE, perl = TRUE) | grepl("低心率", y, fixed = TRUE)
  athlete <- grepl("^athlete$", y, ignore.case = TRUE, perl = TRUE) | grepl("运动员", y, fixed = TRUE)
  out <- rep(NA_integer_, length(y))
  out[athlete & !non] <- 0L
  out[non & high] <- 1L
  out[non & low] <- 2L
  out
}

group_label <- function(code) {
  c("athlete", "nonathlete_high_hr", "nonathlete_low_hr")[as.integer(code) + 1L]
}

mot_path <- Sys.getenv("PMWG_MOT_CSV", unset = "")
if (!nzchar(mot_path)) {
  mot_path <- find_csv(c("subject_id", "stage", "target_count", "mot_selected_targets",
                         "mot_missed_targets", "mot_false_selection_count_int"))
}
drt_path <- Sys.getenv("PMWG_DRT_CSV", unset = "")
if (!nzchar(drt_path)) {
  drt_path <- find_csv(c("subject_id", "state_label", "target_count", "drt_validity_status",
                         "first_rt_ms", "red_onset_timestamp_ms", "deadline_timestamp_ms"))
}
group_path <- Sys.getenv("PMWG_GROUP_CSV", unset = "")
if (!nzchar(group_path)) {
  stop("PMWG_GROUP_CSV must be explicitly set. The grouped model must never auto-select an old group table.")
}

mot <- read_csv_safe(mot_path)
drt <- read_csv_safe(drt_path)
group_raw <- read_csv_safe(group_path)
if (!"mot_false_selection_count_int" %in% names(mot)) {
  alt_false <- intersect(c("mot_false_selection_total", "mot_false_selection_count", "mot_false_selection"), names(mot))[1]
  if (is.na(alt_false)) stop("MOT CSV lacks false-selection count column")
  mot$mot_false_selection_count_int <- mot[[alt_false]]
}
if (!"mot_missed_targets" %in% names(mot)) {
  alt_miss <- intersect(c("mot_missed_target_count", "mot_miss_count", "mot_missed"), names(mot))[1]
  if (is.na(alt_miss)) stop("MOT CSV lacks missed-target count column")
  mot$mot_missed_targets <- mot[[alt_miss]]
}
group_col <- intersect(c("hr_group3", "group_final", "football_group_final"), names(group_raw))[1]
if (is.na(group_col)) stop("The group CSV has no HR three-group column")

groups <- unique(data.frame(
  subject_id = as.character(group_raw$subject_id),
  group_code = group_code(group_raw[[group_col]]),
  stringsAsFactors = FALSE
))
groups <- groups[!duplicated(groups$subject_id) & !is.na(groups$group_code), , drop = FALSE]
groups$group_label <- group_label(groups$group_code)
required_group_codes <- 0:2
if (!setequal(sort(unique(groups$group_code)), required_group_codes)) {
  stop("The grouped PMwG input must contain exactly codes 0, 1, 2: athlete, non-athlete high HR, non-athlete low HR.")
}

mot$subject_id <- as.character(mot$subject_id)
drt$subject_id <- as.character(drt$subject_id)
mot$stage_std <- stage_std(mot$stage)
drt$stage_std <- stage_std(drt$state_label)
mot$target_count <- as.integer(mot$target_count)
drt$target_count <- as.integer(drt$target_count)
mot$mot_selected_targets <- as.numeric(mot$mot_selected_targets)
mot$mot_false_selection_count_int <- as.numeric(mot$mot_false_selection_count_int)
drt$first_rt_ms <- as.numeric(drt$first_rt_ms)
drt$red_onset_timestamp_ms <- as.numeric(drt$red_onset_timestamp_ms)
drt$deadline_timestamp_ms <- as.numeric(drt$deadline_timestamp_ms)
drt$hit <- grepl("^valid", tolower(as.character(drt$drt_validity_status)))
drt$rt <- drt$first_rt_ms / 1000
drt$deadline <- (drt$deadline_timestamp_ms - drt$red_onset_timestamp_ms) / 1000

stages <- c("rest", "exercise1", "exercise2")
balls <- 1:5
mot <- mot[mot$stage_std %in% stages & mot$target_count %in% balls, , drop = FALSE]
drt <- drt[drt$stage_std %in% stages & drt$target_count %in% balls &
             is.finite(drt$deadline) & drt$deadline > 0, , drop = FALSE]
common <- intersect(intersect(unique(mot$subject_id), unique(drt$subject_id)), groups$subject_id)
mot <- merge(mot[mot$subject_id %in% common, , drop = FALSE], groups, by = "subject_id", all.x = TRUE)
drt <- merge(drt[drt$subject_id %in% common, , drop = FALSE], groups, by = "subject_id", all.x = TRUE)
subject_key <- unique(mot[c("subject_id", "group_code", "group_label")])
subject_key <- subject_key[order(subject_key$subject_id), , drop = FALSE]
subject_key$subject <- seq_len(nrow(subject_key))
mot <- merge(mot, subject_key, by = c("subject_id", "group_code", "group_label"), all.x = TRUE)
drt <- merge(drt, subject_key, by = c("subject_id", "group_code", "group_label"), all.x = TRUE)

make_subject_data <- function(s) {
  ms <- mot[mot$subject == s, , drop = FALSE]
  ds <- drt[drt$subject == s, , drop = FALSE]
  if (!nrow(ms) || !nrow(ds)) return(NULL)
  gc <- unique(ms$group_code)[1]
  gl <- unique(ms$group_label)[1]
  m <- aggregate(cbind(mot_selected_targets, mot_false_selection_count_int) ~ stage_std + target_count,
                 data = ms, FUN = sum, na.rm = TRUE)
  ntr <- aggregate(subject_id ~ stage_std + target_count, data = ms, FUN = length)
  names(ntr)[3] <- "n_trials"
  m <- merge(m, ntr, by = c("stage_std", "target_count"), all.x = TRUE)
  m$n_target <- m$target_count * m$n_trials
  m$n_non <- m$n_trials * 10 - m$n_target
  names(m)[names(m) == "mot_selected_targets"] <- "hits"
  names(m)[names(m) == "mot_false_selection_count_int"] <- "false_alarms"
  m$trial_type <- "mot"
  m$subject <- s
  m$condition <- m$target_count
  m$load_c <- (m$target_count - 3) / 2
  m$group_code <- gc
  m$group_label <- gl
  m$hit <- NA_real_
  m$rt <- NA_real_
  m$deadline <- NA_real_
  m2 <- data.frame(
    subject = s, stage_std = ds$stage_std, condition = ds$target_count,
    load_c = (ds$target_count - 3) / 2, group_code = gc, group_label = gl,
    trial_type = "drt", n_target = NA_real_, hits = NA_real_,
    n_non = NA_real_, false_alarms = NA_real_, hit = as.numeric(ds$hit),
    rt = ds$rt, deadline = ds$deadline, stringsAsFactors = FALSE
  )
  m <- m[, names(m2)]
  rbind(m, m2)
}

pm_data <- do.call(rbind, lapply(subject_key$subject, make_subject_data))

log1mexp <- function(log_x) {
  lx <- pmin(pmax(as.numeric(log_x), -745), -1e-12)
  out <- rep(-745, length(lx))
  a <- lx < -0.6931471805599453
  out[a] <- log1p(-exp(lx[a]))
  out[!a] <- log(-expm1(lx[!a]))
  out[!is.finite(out)] <- -745
  out
}

wald_logpdf <- function(y, drift, noise, boundary = 1) {
  y <- pmax(as.numeric(y), 1e-12)
  log(boundary) - 0.5 * log(2 * pi * noise^2) - 1.5 * log(y) -
    (boundary - drift * y)^2 / (2 * noise^2 * y)
}

wald_logcdf <- function(y, drift, noise, boundary = 1) {
  y <- pmax(as.numeric(y), 1e-12)
  drift <- pmin(pmax(as.numeric(drift), 1e-8), 1e4)
  noise <- pmin(pmax(as.numeric(noise), 1e-6), 1e3)
  root <- pmax(noise * sqrt(y), 1e-12)
  a <- (drift * y - boundary) / root
  b <- -(drift * y + boundary) / root
  l1 <- pmax(log(pnorm(a)), -745)
  l2 <- pmax(2 * drift * boundary / noise^2 + log(pnorm(b)), -745)
  m <- pmax(l1, l2)
  z <- m + log(exp(l1 - m) + exp(l2 - m))
  z[!is.finite(z)] <- -745
  pmax(pmin(z, -1e-12), -745)
}

wald_logsurvival <- function(y, drift, noise, boundary = 1) {
  z <- rep(0, length(y))
  ok <- is.finite(y) & y > 0
  if (any(ok)) z[ok] <- log1mexp(wald_logcdf(y[ok], drift[ok], noise, boundary))
  z[!is.finite(z)] <- -745
  z
}

group_tags <- c("high", "low")
pars <- c(
  paste0("log_G_", stages),
  unlist(lapply(stages, function(s) paste0("group_log_G_", s, "_", group_tags))),
  unlist(lapply(stages, function(s) paste0("logit_pi_", s, "_", balls))),
  unlist(lapply(stages, function(s) unlist(lapply(balls, function(b) paste0("group_logit_pi_", s, "_", b, "_", group_tags))))),
  paste0("log_k_", balls),
  "criterion_0", "criterion_load", "criterion_ex1", "criterion_ex2",
  "go_failure_0", "go_failure_load", "go_failure_ex1", "go_failure_ex2",
  paste0("log_sigma_", stages), paste0("t0_logit_", stages),
  unlist(lapply(stages, function(s) paste0("group_go_failure_", s, "_", group_tags)))
)
idx <- setNames(seq_along(pars), pars)

group_offset <- function(x, prefix, stage, code, ball = NULL) {
  if (!code %in% 1:2) return(0)
  tag <- group_tags[code]
  if (is.null(ball)) return(x[idx[paste0(prefix, stage, "_", tag)]])
  x[idx[paste0(prefix, stage, "_", ball, "_", tag)]]
}

ll_resource_pool <- function(x, data) {
  mot_rows <- data[data$trial_type == "mot", , drop = FALSE]
  drt_rows <- data[data$trial_type == "drt", , drop = FALSE]
  if (nrow(mot_rows) < 8 || nrow(drt_rows) < 10) return(-1e10)

  sm <- match(mot_rows$stage_std, stages)
  bm <- as.integer(mot_rows$condition)
  gm <- as.integer(mot_rows$group_code)
  base_g <- x[idx[paste0("log_G_", stages)]][sm]
  g_add <- vapply(seq_len(nrow(mot_rows)), function(i) group_offset(x, "group_log_G_", stages[sm[i]], gm[i]), numeric(1))
  Gm <- exp(base_g + g_add)
  pi0 <- plogis(x[idx[paste0("logit_pi_", stages, "_", 1)]])
  pi_matrix <- matrix(NA_real_, nrow = length(stages), ncol = length(balls))
  for (s in seq_along(stages)) pi_matrix[s, ] <- plogis(x[idx[paste0("logit_pi_", stages[s], "_", balls)]])
  pim <- vapply(seq_len(nrow(mot_rows)), function(i) {
    p <- pi_matrix[sm[i], bm[i]]
    if (gm[i] %in% 1:2) p <- plogis(qlogis(p) + group_offset(x, "group_logit_pi_", stages[sm[i]], gm[i], bm[i]))
    p
  }, numeric(1))
  k <- exp(x[idx[paste0("log_k_", balls)]])
  d <- pmin(pmax(k[bm] * (1 - pim) * Gm, 1e-6), 1e4)
  cprop <- plogis(x[idx["criterion_0"]] + x[idx["criterion_load"]] * mot_rows$load_c +
                    x[idx["criterion_ex1"]] * (sm == 2) + x[idx["criterion_ex2"]] * (sm == 3))
  ph <- pmin(pmax(pnorm((1 - cprop) * d), 1e-9), 1 - 1e-9)
  pfa <- pmin(pmax(pnorm(-cprop * d), 1e-9), 1 - 1e-9)
  z <- sum(dbinom(mot_rows$hits, mot_rows$n_target, ph, log = TRUE), na.rm = TRUE) +
    sum(dbinom(mot_rows$false_alarms, mot_rows$n_non, pfa, log = TRUE), na.rm = TRUE)

  sd <- match(drt_rows$stage_std, stages)
  bd <- as.integer(drt_rows$condition)
  gd <- as.integer(drt_rows$group_code)
  base_gd <- x[idx[paste0("log_G_", stages)]][sd]
  g_add_d <- vapply(seq_len(nrow(drt_rows)), function(i) group_offset(x, "group_log_G_", stages[sd[i]], gd[i]), numeric(1))
  Gd <- exp(base_gd + g_add_d)
  pid <- vapply(seq_len(nrow(drt_rows)), function(i) {
    p <- pi_matrix[sd[i], bd[i]]
    if (gd[i] %in% 1:2) p <- plogis(qlogis(p) + group_offset(x, "group_logit_pi_", stages[sd[i]], gd[i], bd[i]))
    p
  }, numeric(1))
  drift <- pmin(pmax(pid * Gd, 1e-6), 1e4)
  f0 <- plogis(x[idx["go_failure_0"]] + x[idx["go_failure_load"]] * drt_rows$load_c +
                 x[idx["go_failure_ex1"]] * (sd == 2) + x[idx["go_failure_ex2"]] * (sd == 3))
  f <- vapply(seq_len(nrow(drt_rows)), function(i) {
    if (gd[i] %in% 1:2) plogis(qlogis(f0[i]) + group_offset(x, "group_go_failure_", stages[sd[i]], gd[i])) else f0[i]
  }, numeric(1))
  sigma <- exp(x[idx[paste0("log_sigma_", stages)]][sd])
  min_by_stage <- tapply(drt_rows$rt[drt_rows$hit & is.finite(drt_rows$rt)],
                         drt_rows$stage_std[drt_rows$hit & is.finite(drt_rows$rt)], min, na.rm = TRUE)
  min_rt <- as.numeric(min_by_stage[drt_rows$stage_std])
  min_rt[!is.finite(min_rt) | min_rt <= 0] <- 0.2
  t0 <- min_rt * plogis(x[idx[paste0("t0_logit_", stages)]][sd])
  valid <- drt_rows$hit & is.finite(drt_rows$rt) & drt_rows$rt > t0
  if (any(valid)) z <- z + sum(log1p(-f[valid]) + wald_logpdf(drt_rows$rt[valid] - t0[valid], drift[valid], sigma[valid]))
  miss <- !valid
  if (any(miss)) {
    deadline <- pmax(drt_rows$deadline[miss] - t0[miss], 1e-6)
    surv <- wald_logsurvival(deadline, drift[miss], sigma[miss])
    z <- z + sum(log(f[miss] + (1 - f[miss]) * exp(surv)))
  }
  ifelse(is.finite(z), z, -1e10)
}

prior <- list(theta_mu_mean = rep(0, length(pars)), theta_mu_var = diag(rep(4, length(pars))))
start_mu <- rep(0, length(pars)); names(start_mu) <- pars
start_mu[grep("go_failure_0", pars)] <- -2
start_mu[grep("log_sigma", pars)] <- -1
start_sig <- diag(rep(0.20, length(pars)))

audit <- data.frame(
  n_subjects = nrow(subject_key), mot_rows = nrow(mot), drt_rows = nrow(drt),
  athlete_n = sum(subject_key$group_code == 0), nonathlete_high_hr_n = sum(subject_key$group_code == 1),
  nonathlete_low_hr_n = sum(subject_key$group_code == 2), n_parameters = length(pars), mode = mode,
  rest_mot = sum(mot$stage_std == "rest"), exercise1_mot = sum(mot$stage_std == "exercise1"),
  exercise2_mot = sum(mot$stage_std == "exercise2"), rest_drt = sum(drt$stage_std == "rest"),
  exercise1_drt = sum(drt$stage_std == "exercise1"), exercise2_drt = sum(drt$stage_std == "exercise2")
)
write.csv(audit, file.path(out_dir, "data_audit.csv"), row.names = FALSE, fileEncoding = "UTF-8")
write.csv(subject_key, file.path(out_dir, "subject_group_audit.csv"), row.names = FALSE, fileEncoding = "UTF-8")
writeLines(c(paste0("mot=", mot_path), paste0("drt=", drt_path), paste0("groups=", group_path)), file.path(out_dir, "input_paths.txt"))
writeLines(c(
  "正式模型：三组联合 MOT/DRT 资源池 PMwG",
  "组别0=运动员；组别1=非运动员高心率；组别2=非运动员低心率。",
  "组别效应直接进入联合似然中的 G、pi 和 DRT go-failure，不是后处理分组。",
  paste0("人数：运动员=", audit$athlete_n, "；非运动员高心率=", audit$nonathlete_high_hr_n,
         "；非运动员低心率=", audit$nonathlete_low_hr_n),
  "设计：rest/exercise1/exercise2 × target_count 1-5。",
  "模型组成：MOT SDT命中/误选、DRT hit/miss与Wald RT、go-failure、删失、G、pi1-pi5、阶段效应和被试随机效应。",
  "这是基于原文结构的适配模型；由于实验数据结构不同，后验数值不应声称与原文完全相同。"
), file.path(out_dir, "grouped_model_spec.md"))

prep_path <- file.path(out_dir, "checkpoint_prepare.rds")
burn_path <- file.path(out_dir, "checkpoint_burn.rds")
adapt_path <- file.path(out_dir, "checkpoint_adapt.rds")
sample_path <- file.path(out_dir, "checkpoint_sample.rds")

if (phase == "prepare") {
  saveRDS(list(pm_data = pm_data, subject_key = subject_key, pars = pars,
               start_mu = start_mu, start_sig = start_sig, audit = audit), prep_path)
  cat("PREPARE_DONE\n")
  quit(save = "no", status = 0)
}
if (!file.exists(prep_path)) stop("Missing prepare checkpoint")
prep <- readRDS(prep_path)

particles <- if (mode == "full") 100L else 30L
burn_iter <- as.integer(Sys.getenv("PMWG_BURN_ITER", ifelse(mode == "full", "1000", "50")))
adapt_iter <- as.integer(Sys.getenv("PMWG_ADAPT_ITER", ifelse(mode == "full", "5000", "300")))
sample_iter <- as.integer(Sys.getenv("PMWG_SAMPLE_ITER", ifelse(mode == "full", "5000", "100")))
n_cores <- max(1L, as.integer(Sys.getenv("PMWG_N_CORES", "1")))
set.seed(20260727)

# pmwg::run_stage uses mclapply when n_cores > 1, which is unsupported on
# Windows. This is the same PMwG stage loop with a PSOCK cluster replacing
# only the worker dispatch; particles, iterations, likelihood and adaptation
# settings are unchanged.
run_stage_windows <- function(pmwgs, stage, iter = 1000, particles = 100,
                              display_progress = TRUE, n_cores = 1,
                              n_unique = ifelse(stage == "adapt", 100, NA),
                              epsilon = NULL, p_accept = 0.8, mix = NULL,
                              pdist_update_n = ifelse(stage == "sample", 50, NA)) {
  subj_epsilon <- pmwgs$samples$epsilon[, pmwgs$samples$idx]
  if (is.null(subj_epsilon)) stop("Try running augment_sampler_epsilon(sampler) first")
  if (is.na(subj_epsilon[1])) {
    epsilon <- pmwg:::set_epsilon(pmwgs$n_pars, epsilon)
    subj_epsilon <- rep(epsilon, pmwgs$n_subjects)
  }
  mix <- pmwg:::set_mix(stage, mix)
  check_args <- as.list(environment())
  # The package validator rejects n_cores > 1 on Windows because its own
  # implementation uses mclapply; all other validation remains unchanged.
  check_args$n_cores <- 1L
  do.call(pmwg:::check_run_stage_args, check_args)
  alpha_star <- -stats::qnorm(p_accept / 2)
  n0 <- round(5 / (p_accept * (1 - p_accept)))
  unique_inc <- 20
  msgs <- list(burn = "Phase 1: Burn in\n", adapt = "Phase 2: Adaptation\n",
               sample = "Phase 3: Sampling\n")
  cat(msgs[[stage]])
  pmwgs <- pmwg:::extend_sampler(pmwgs, iter, stage)
  if (display_progress) pb <- pmwg:::accept_progress_bar(min = 0, max = iter)
  start_iter <- pmwgs$samples$idx
  collected_msgs <- list()
  stable_args <- list(data = pmwgs$data, num_particles = particles,
                      mix_proportion = mix, likelihood_func = pmwgs$ll_func,
                      subjects = pmwgs$subjects)

  cl <- NULL
  if (n_cores > 1) {
    cl <- parallel::makeCluster(n_cores, type = "PSOCK")
    parallel::clusterEvalQ(cl, library(pmwg))
    parallel::clusterExport(cl, c("stages", "balls", "group_tags", "idx",
                                  "log1mexp", "wald_logpdf", "wald_logcdf",
                                  "wald_logsurvival", "group_offset",
                                  "ll_resource_pool"), envir = .GlobalEnv)
    parallel::clusterSetRNGStream(cl, iseed = 20260727)
    on.exit(parallel::stopCluster(cl), add = TRUE)
  }
  worker_new_sample <- function(s, data, num_particles, parameters,
                                efficient_mu = NULL, efficient_sig2 = NULL,
                                mix_proportion, likelihood_func, epsilon, subjects) {
    tryCatch(
      pmwg:::new_sample(s, data = data, num_particles = num_particles,
                        parameters = parameters, efficient_mu = efficient_mu,
                        efficient_sig2 = efficient_sig2,
                        mix_proportion = mix_proportion,
                        likelihood_func = likelihood_func, epsilon = epsilon,
                        subjects = subjects),
      error = function(e) structure(conditionMessage(e), class = "try-error")
    )
  }
  # Windows PSOCK serializes arguments for every task.  The subject data never
  # change within a stage, so send them to each worker only once.  Per iteration
  # we then export the current proposal state once per worker rather than once
  # per subject.  This changes dispatch overhead only, not particles, priors,
  # likelihood, adaptation, or sampling iterations.
  worker_new_sample_cached <- function(s) {
    a <- .pmwg_iteration_args
    tryCatch(
      pmwg:::new_sample(s, data = .pmwg_static_data,
                        num_particles = .pmwg_static_particles,
                        parameters = a$parameters,
                        efficient_mu = a$efficient_mu,
                        efficient_sig2 = a$efficient_sig2,
                        mix_proportion = a$mix_proportion,
                        likelihood_func = ll_resource_pool,
                        epsilon = a$epsilon,
                        subjects = .pmwg_static_subjects),
      error = function(e) structure(conditionMessage(e), class = "try-error")
    )
  }
  if (!is.null(cl)) {
    .pmwg_static_data <- stable_args$data
    .pmwg_static_particles <- stable_args$num_particles
    .pmwg_static_subjects <- stable_args$subjects
    parallel::clusterExport(cl, c(".pmwg_static_data", ".pmwg_static_particles",
                                  ".pmwg_static_subjects", "worker_new_sample_cached"),
                            envir = environment())
  }

  # Equivalent incremental implementation of pmwg:::test_sampler_adapted.
  # The package implementation repeatedly copies the entire growing adapt
  # chain solely to count unique alpha[1, subject] values.  Maintaining those
  # sets as samples arrive yields the same trigger condition and invokes
  # conditional_parms on exactly the same eligible iterations, without the
  # repeated full-chain allocations that stall Windows PSOCK runs.
  adapt_unique_alpha <- NULL
  if (stage == "adapt") {
    adapt_unique_alpha <- vector("list", pmwgs$n_subjects)
  }

  for (i in seq_len(iter)) {
    if (display_progress) pmwg:::update_progress_bar(pb, i, extra = mean(pmwg:::accept_rate(pmwgs)))
    stable_args <- utils::modifyList(stable_args, pmwg:::set_proposal(i, stage, pmwgs, pdist_update_n))
    tryCatch(pars <- pmwg:::gibbs_step(pmwgs), error = function(err_cond) {
      pmwg:::gibbs_step_err(pmwgs, err_cond)
    })
    if (is.null(cl)) {
      tmp <- lapply(seq_len(pmwgs$n_subjects), worker_new_sample,
                    data = stable_args$data, num_particles = stable_args$num_particles,
                    parameters = pars, efficient_mu = stable_args$efficient_mu,
                    efficient_sig2 = stable_args$efficient_sig2,
                    mix_proportion = stable_args$mix_proportion,
                    likelihood_func = stable_args$likelihood_func,
                    epsilon = subj_epsilon, subjects = stable_args$subjects)
    } else {
      .pmwg_iteration_args <- list(parameters = pars,
                                   efficient_mu = stable_args$efficient_mu,
                                   efficient_sig2 = stable_args$efficient_sig2,
                                   mix_proportion = stable_args$mix_proportion,
                                   epsilon = subj_epsilon)
      parallel::clusterExport(cl, ".pmwg_iteration_args", envir = environment())
      tmp <- parallel::parLapply(cl, seq_len(pmwgs$n_subjects), worker_new_sample_cached)
    }
    lapply(tmp, function(x) {
      if (inherits(x, "try-error")) pmwg:::new_sample_err(pmwgs, parent.frame(), x)
    })
    ll <- unlist(lapply(tmp, attr, "ll"))
    alpha <- array(unlist(tmp), dim = dim(pars$alpha))
    j <- start_iter + i
    pmwgs$samples$theta_mu[, j] <- pars$tmu
    pmwgs$samples$theta_sig[, , j] <- pars$tsig
    pmwgs$samples$last_theta_sig_inv <- pars$tsinv
    pmwgs$samples$alpha[, , j] <- alpha
    pmwgs$samples$idx <- j
    pmwgs$samples$subj_ll[, j] <- ll
    pmwgs$samples$a_half[, j] <- pars$a_half
    pmwgs$samples$epsilon[, j] <- subj_epsilon
    if (!is.null(p_accept) && j > n0) {
      acc <- pmwgs$samples$alpha[1, , j] != pmwgs$samples$alpha[1, , j - 1]
      subj_epsilon <- pmwg:::update_epsilon(subj_epsilon, acc, p_accept, j,
                                            pmwgs$n_pars, alpha_star)
    }
    if (stage == "adapt") {
      for (s in seq_len(pmwgs$n_subjects)) {
        adapt_unique_alpha[[s]] <- union(adapt_unique_alpha[[s]], alpha[1, s])
      }
      if (i >= n_unique && all(lengths(adapt_unique_alpha) > n_unique)) {
        # This is the same success/failure branch as test_sampler_adapted().
        test_samples <- pmwg:::extract_samples(pmwgs, stage = "adapt")
        attempt <- try(
          lapply(seq_len(pmwgs$n_subjects), pmwg:::conditional_parms, samples = test_samples),
          silent = TRUE
        )
        if (inherits(attempt, "try-error")) {
          n_unique <- n_unique + unique_inc
          collected_msgs <- c(collected_msgs,
                              paste("WARNING:", n_unique - unique_inc,
                                    "values used in failed attempt to create proposal distribution\n"))
        } else {
          collected_msgs <- c(collected_msgs,
                              paste("MESSAGE:", i, "iterations before successful adaptation\n"))
          break
        }
      }
    }
  }
  if (display_progress) close(pb)
  if (length(collected_msgs) > 0) lapply(collected_msgs, cat)
  if (stage == "adapt") {
    if (i == iter) warning("PMwG adaptation reached the configured full iteration count.")
    else pmwgs <- pmwg:::trim_na(pmwgs)
  }
  pmwgs
}

if (phase == "burn") {
  sampler <- pmwgs(data = prep$pm_data, pars = prep$pars, ll_func = ll_resource_pool, prior = prior)
  sampler <- init(sampler, start_mu = prep$start_mu, start_sig = prep$start_sig,
                  display_progress = TRUE, particles = particles)
  sampler <- run_stage_windows(sampler, stage = "burn", iter = burn_iter, particles = particles,
                       display_progress = TRUE, n_cores = n_cores)
  saveRDS(sampler, burn_path); cat("BURN_DONE\n"); quit(save = "no", status = 0)
}
if (phase == "adapt") {
  if (!file.exists(burn_path)) stop("Missing burn checkpoint")
  sampler <- readRDS(burn_path)
  sampler <- run_stage_windows(sampler, stage = "adapt", iter = adapt_iter, particles = particles,
                       display_progress = TRUE, n_cores = n_cores)
  saveRDS(sampler, adapt_path); cat("ADAPT_DONE\n"); quit(save = "no", status = 0)
}
if (phase == "sample") {
  if (!file.exists(adapt_path)) stop("Missing adapt checkpoint")
  sampler <- readRDS(adapt_path)
  sampler <- run_stage_windows(sampler, stage = "sample", iter = sample_iter, particles = particles,
                       display_progress = TRUE, n_cores = n_cores)
  saveRDS(sampler, sample_path)
  saveRDS(sampler$samples, file.path(out_dir, paste0("PMwG_samples_", mode, ".rds")))
  cat("SAMPLE_DONE\n"); quit(save = "no", status = 0)
}
if (phase == "postprocess") {
  if (!file.exists(sample_path)) stop("Missing sample checkpoint")
  sampler <- readRDS(sample_path)
  s <- sampler$samples
  saveRDS(s, file.path(out_dir, paste0("PMwG_samples_", mode, ".rds")))
  sample_idx <- if (!is.null(s$stage)) which(s$stage == "sample") else seq_len(dim(s$alpha)[3])
  if (!length(sample_idx)) sample_idx <- seq_len(dim(s$alpha)[3])
  alpha <- s$alpha[, , sample_idx, drop = FALSE]
  mu <- s$theta_mu[, sample_idx, drop = FALSE]
  qsummary <- function(v) {
    v <- as.numeric(v); v <- v[is.finite(v)]
    if (!length(v)) return(c(mean = NA_real_, median = NA_real_, sd = NA_real_, q025 = NA_real_, q975 = NA_real_))
    c(mean = mean(v), median = median(v), sd = sd(v), q025 = quantile(v, .025, names = FALSE), q975 = quantile(v, .975, names = FALSE))
  }
  pop <- do.call(rbind, lapply(seq_len(nrow(mu)), function(i) {
    z <- qsummary(mu[i, ]); data.frame(parameter = rownames(mu)[i], t(z), row.names = NULL)
  }))
  write.csv(pop, file.path(out_dir, "population_posterior_parameters.csv"), row.names = FALSE, fileEncoding = "UTF-8")
  get_alpha <- function(name) matrix(as.numeric(alpha[name, , , drop = FALSE]), nrow = dim(alpha)[2], ncol = dim(alpha)[3])
  rows <- list(); group_rows <- list(); pair_rows <- list()
  group_order <- 0:2
  group_labels <- c("athlete", "nonathlete_high_hr", "nonathlete_low_hr")
  for (st in stages) for (ball in balls) {
    pi_name <- paste0("logit_pi_", st, "_", ball)
    g_name <- paste0("log_G_", st)
    pi_base <- plogis(get_alpha(pi_name)); g_base <- exp(get_alpha(g_name)); k <- exp(get_alpha(paste0("log_k_", ball)))
    for (gc in group_order) {
      if (gc == 0) { g_draw <- g_base; pi_draw <- pi_base }
      else {
        g_draw <- exp(log(g_base) + get_alpha(paste0("group_log_G_", st, "_", group_tags[gc])))
        pi_draw <- plogis(qlogis(pmin(pmax(pi_base, 1e-8), 1 - 1e-8)) + get_alpha(paste0("group_logit_pi_", st, "_", ball, "_", group_tags[gc])))
      }
      d_draw <- k * (1 - pi_draw) * g_draw
      v_draw <- pi_draw * g_draw
      for (metric in c("G", "pi", "mot_dprime_proxy", "drt_drift_proxy")) {
        dd <- switch(metric, G = g_draw, pi = pi_draw, mot_dprime_proxy = d_draw, drt_drift_proxy = v_draw)
        z <- qsummary(dd)
        group_rows[[length(group_rows) + 1L]] <- data.frame(group = group_labels[gc + 1L], group_code = gc,
          stage = st, target_count = ball, parameter = metric, n = sum(subject_key$group_code == gc), t(z), row.names = NULL)
      }
      rows[[length(rows) + 1L]] <- data.frame(group = group_labels[gc + 1L], group_code = gc,
        stage = st, target_count = ball, G_mean = mean(g_draw), G_q025 = quantile(g_draw, .025), G_q975 = quantile(g_draw, .975),
        pi_mean = mean(pi_draw), pi_q025 = quantile(pi_draw, .025), pi_q975 = quantile(pi_draw, .975),
        mot_dprime_proxy_mean = mean(d_draw), mot_dprime_proxy_q025 = quantile(d_draw, .025), mot_dprime_proxy_q975 = quantile(d_draw, .975),
        drt_drift_proxy_mean = mean(v_draw), drt_drift_proxy_q025 = quantile(v_draw, .025), drt_drift_proxy_q975 = quantile(v_draw, .975))
    }
    for (a in 0:1) for (b in (a + 1):2) {
      ga <- if (a == 0) g_base else exp(log(g_base) + get_alpha(paste0("group_log_G_", st, "_", group_tags[a])))
      gb <- if (b == 0) g_base else exp(log(g_base) + get_alpha(paste0("group_log_G_", st, "_", group_tags[b])))
      pa <- if (a == 0) pi_base else plogis(qlogis(pmin(pmax(pi_base, 1e-8), 1 - 1e-8)) + get_alpha(paste0("group_logit_pi_", st, "_", ball, "_", group_tags[a])))
      pb <- if (b == 0) pi_base else plogis(qlogis(pmin(pmax(pi_base, 1e-8), 1 - 1e-8)) + get_alpha(paste0("group_logit_pi_", st, "_", ball, "_", group_tags[b])))
      for (metric in c("G", "pi", "mot_dprime_proxy", "drt_drift_proxy")) {
        va <- switch(metric, G = ga, pi = pa, mot_dprime_proxy = k * (1 - pa) * ga, drt_drift_proxy = pa * ga)
        vb <- switch(metric, G = gb, pi = pb, mot_dprime_proxy = k * (1 - pb) * gb, drt_drift_proxy = pb * gb)
        z <- qsummary(va - vb)
        pair_rows[[length(pair_rows) + 1L]] <- data.frame(group_a = group_labels[a + 1L], group_b = group_labels[b + 1L],
          stage = st, target_count = ball, parameter = metric, t(z), posterior_probability_a_gt_b = mean(va > vb), row.names = NULL)
      }
    }
  }
  write.csv(do.call(rbind, rows), file.path(out_dir, "subject_group_stage_ball_resource_posterior_summary.csv"), row.names = FALSE, fileEncoding = "UTF-8")
  write.csv(do.call(rbind, group_rows), file.path(out_dir, "PMwG_three_group_stage_ball_parameter_summary.csv"), row.names = FALSE, fileEncoding = "UTF-8")
  write.csv(do.call(rbind, pair_rows), file.path(out_dir, "PMwG_three_group_stage_ball_pairwise_posterior_contrasts.csv"), row.names = FALSE, fileEncoding = "UTF-8")
  write.csv(data.frame(model = "three_stage_grouped_resource_pool_PMwG", n_subjects = nrow(subject_key),
                       parameters = length(pars), posterior_draws = length(sample_idx), stages = paste(stages, collapse = ","), balls = "1,2,3,4,5",
                       athlete_n = sum(subject_key$group_code == 0), nonathlete_high_hr_n = sum(subject_key$group_code == 1),
                       nonathlete_low_hr_n = sum(subject_key$group_code == 2), n_cores = n_cores),
            file.path(out_dir, "PMwG_run_audit.csv"), row.names = FALSE, fileEncoding = "UTF-8")
  writeLines(c("Three-stage grouped resource-pool PMwG completed.",
                "Group code 0 athlete; 1 non-athlete high HR; 2 non-athlete low HR.",
                "G and pi group effects enter the joint MOT/DRT likelihood.",
                "Posterior intervals and P(>0) are not traditional p values.",
                "This is an original-framework adaptation; numerical posteriors cannot equal the paper.",
                "All stage x ball x group resource summaries and posterior pairwise contrasts are exported."),
             file.path(out_dir, "PMwG_model_notes.md"))
  cat("POSTPROCESS_DONE\n"); quit(save = "no", status = 0)
}
