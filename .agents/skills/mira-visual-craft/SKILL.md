---
name: mira-visual-craft
description: Design principles and visual craft standards for MIRA (Municipal Intelligence for Rules & Architecture). Covers architectural UI design, custom SVG graphics, high-quality Three.js spatial visualization, evidence-linked constraints, and zero-hallucination UI patterns.
---

# MIRA Visual Craft & Architectural Interface Guidelines

## Product Identity
* **Name:** MIRA (Municipal Intelligence for Rules & Architecture)
* **Tagline:** "See the Rules. Understand the Structure."
* **Persona:** Senior Technical Architect and Building-Permission Clerk at Bhopal Municipal Corporation.
* **Context:** Claude Impact Lab × Cerebras Café Compute, Track 1: Bhumi Vikas Sahayak.

## Core Design Principles

### 1. Distinctive Architectural Visual Design
* MIRA is an engineering instrument for municipal planning, not a generic consumer chatbot.
* Use precision typographic hierarchy (Geist, Geist Mono, Noto Sans Devanagari for statutory Hindi provisions).
* Maintain a curated architectural palette: deep ink backgrounds (`#0a0f1d`), subtle drafting grids, blueprint cobalt highlights (`#2f4fc7`), and crisp statutory border accents.

### 2. High-Quality Three.js Spatial Visualisation
* The **Rule-to-Geometry Engine** is the visual differentiator of MIRA.
* Visualise plots as drafting boards with axis grids, street frontages, and exact metric dimensions.
* Draw verified setback zones with translucent spatial volume fills and boundary outlines.
* Provide an automatic fallback (e.g., 2D Plan canvas) when WebGL is unavailable.

### 3. Evidence-Linked Regulatory Constraints
* Every dimension, setback, or clearance shown on screen must be directly tethered to a verified statutory rule (e.g., Rule 56(1)(a) Table 4, p. 77).
* Clicking a 3D geometry zone in the plot highlights the corresponding legal text in the Regulation Inspector.

### 4. Zero Fabricated Legal Requirements
* Never fabricate rules, calculations, or compliance statuses.
* When inputs are missing, display an explicit `MORE_INFORMATION_NEEDED` state listing the missing parameters.
* When queries are outside scope, return an explicit `NOT_FOUND` state without speculative conversational filler.

### 5. Real Browser Verification
* Validate UI rendering, responsiveness, and interaction flow in actual browser sessions.
* Ensure print stylesheets for the Counter Receipt render cleanly on standard A4 paper without overflow.
