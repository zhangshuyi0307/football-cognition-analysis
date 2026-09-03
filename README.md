# Football Cognition Experiment and Behavioral Modeling

This repository contains a portfolio-ready subset of a football cognition research project. It includes browser-based cognitive task code and reproducible analysis scripts for behavioral modeling across pre-exercise, during/post-exercise, and post-exercise cognitive measurements.

## What Is Included

- `experiment_app/`: jsPsych-based experiment code for multiple cognitive paradigms, including MOT/DRT, SART, Corsi, Flanker, BART/BELT-style risk learning, and football decision-making tasks.
- `analysis/scripts/`: reproducible analysis scripts for data cleaning, MOT/DRT resource-proxy modeling, PMwG/resource-pool model preparation, true-deadline DRT auditing, multi-paradigm report generation, and codebook construction.
- `analysis/results/`: aggregate tables and publication-style figures from the cleaned analysis outputs.

Word reports are not included in this GitHub-ready folder because they are binary reference documents and should be reviewed separately before public sharing.

## Main Analysis Components

- Behavioral resource-proxy model: derives load-standardized MOT/DRT resource and allocation proxy indices (`G_lite`, `pi_MOT_lite`) and fits group by stage by load models with cluster-robust inference.
- PMwG resource-pool pipeline: prepares cleaned MOT/DRT inputs and runs a hierarchical grouped PMwG model for the formal resource-pool analysis.
- Multi-paradigm reporting: reconstructs HR3-group reports for SART, Flanker, Corsi, BELT/risk learning, and football decision-making.
- Data dictionary/codebook: generates task-level code lists and variable definitions for six paradigms.

## Privacy and Data Availability

Raw participant-level data, real participant identifiers, private phone mappings, environment files, server allocation files, audio/video recordings, and large stimulus assets are intentionally excluded from this public-ready copy.

Some scripts still contain local Windows/F-drive paths from the original analysis environment. To reproduce the pipeline on another machine, update the input/output path constants and provide a private, non-versioned data directory.

## Suggested CV Description

Built jsPsych-based cognitive task paradigms and implemented behavioral modeling pipelines for MOT/DRT dual-task performance, including resource-proxy indices, grouped stage/load analyses, PMwG resource-pool preparation, and multi-paradigm report generation.
