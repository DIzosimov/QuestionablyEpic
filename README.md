> This is my fork of [Voulk/QuestionablyEpic](https://github.com/Voulk/QuestionablyEpic).
> My role: developer. My contribution: [PLACEHOLDER — not yet told to this worker: what did you add, fix or change in this fork?]

# QE Live Documentation

QE Live is a healing modelling tool and gear analysis tool for World of Warcraft. It helps healers evaluate gear, trinkets, and stats across Retail and Classic.

## Key Capabilities

The tool offers eight primary features including gear ranking, upgrade discovery, trinket comparison, embellishment evaluation, and stat weight calculation. It supports all healing specializations across both game versions, ranging from Restoration Druids to Classic healers.

## Development Environment

The project requires Node 16.8.0 and can be launched locally via npm. Testing uses Jest in watch mode, with options to run specific test files by pattern matching.

## Architecture Overview

The codebase divides functionality into shared logic (General), version-specific implementations (Retail and Classic), and supporting systems. The General section contains core utilities for stat conversions, item calculations, and spec definitions. Version-specific engines handle combat multipliers and effect formulas particular to each game version.

## Technology Foundation

The application relies on React 18 with TypeScript and implements Redux for state management. UI components come from Material UI v5, while data visualization uses Recharts. The project supports multiple languages through i18next integration and includes comprehensive testing infrastructure.
