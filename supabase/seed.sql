-- CORRECTED supabase/seed.sql

-- Insert the Market Research chapter template
-- The ON CONFLICT (name) DO NOTHING clause prevents errors if you run the seed script multiple times.
INSERT INTO public.chapter_templates (name, chapter_prompt)
VALUES (
  'Market Research',
  'You are an expert AI assistant tasked with writing the FINAL, polished version of the chapter ''Market Research'' for an investment memo.
The instructions to generate the chapter are: # Chapter Prompt - Market Research (Early Stage Corporate Innovation)

## Chapter Purpose
This chapter establishes the market opportunity size, growth dynamics, and competitive landscape to assess if there''s sufficient potential to justify resource allocation. For early-stage projects, we focus on addressable market validation, entry timing, and identifying early market signals.

## Overview Questions (Answer in order, 2-3 sentences each)

1. **How big is the realistic opportunity?**
   - State the addressable market size with confidence level
   - Identify the specific segment we can actually serve
   - Clarify assumptions behind market estimates

2. **What market dynamics favor or hinder entry?**
   - Describe key growth drivers or headwinds
   - Note regulatory or technology shifts affecting opportunity
   - State whether market timing is favorable

3. **Who else is pursuing this opportunity?**
   - Identify direct competitors and their approach
   - Note indirect solutions customers use today
   - Assess competitive intensity and our differentiation

4. **What market evidence do we need most?**
   - Identify the biggest market assumption to validate
   - Propose specific market research to reduce uncertainty
   - Estimate effort to gather critical market data

## Key Focus Areas for Early Stage Assessment

### Market Definition & Sizing
- Total addressable market (TAM) vs. realistic serviceable market
- Market segmentation by customer type, geography, use case
- Growth projections and underlying drivers
- Confidence level in market estimates

### Market Dynamics & Timing
- What''s changing that creates opportunity
- Regulatory, technology, or behavior shifts
- Market maturity and adoption stage
- Window of opportunity assessment

### Competitive Environment
- Direct competitors and their strategies
- Indirect/substitute solutions
- Barriers to entry and competitive moats
- Our potential differentiation

### Market Validation Approach
- Key market assumptions to test
- Customer segments to research first
- Data sources and research methods
- Early market signals to monitor

## Evidence Sources Priority (Early Stage)

**Primary Sources:**
- Industry analyst reports (Gartner, Forrester, etc.)
- Government/trade association data
- Competitor analysis and funding activity
- Customer interviews or surveys
- Internal market knowledge from business units

**Secondary Sources:**
- News and trade publications
- Academic research and case studies
- Patent filing trends
- Investment activity and M&A deals
- Search trends and social signals

## Unique Aspects for Corporate Innovation

Unlike startup market assessment, consider:
- Existing customer relationships we can leverage
- Market knowledge from current operations
- Ability to shape market through corporate influence
- Strategic value beyond pure market size
- Synergies with existing business lines
- Risk of cannibalization of current products

Remember: We''re assessing whether a sufficient market opportunity exists to justify validation investment, not precise revenue projections. Focus on understanding market fundamentals and our right to win.
The recommended structure for the chapter is: # Section Specific Prompt - Market Research

## Section Instructions for General Analysis

### --- Section 1: Market Size & Segmentation ---

**Purpose**: Define the total opportunity and identify the most attractive segments for initial focus.

**Analysis Framework**:
- **TAM Definition**: Total market size with clear boundaries and assumptions
- **SAM Identification**: Serviceable addressable market based on our capabilities
- **SOM Projection**: Realistic share we could capture in 3-5 years
- **Segmentation Logic**: Break down by customer type, geography, use case, or need intensity
- **Segment Prioritization**: Which segments to target first and why

**Key Questions**:
- What''s the total market size and how was it calculated?
- Which segments are we uniquely positioned to serve?
- What market share is realistic given competition?
- Which segment offers the best entry point?
- How confident are we in these estimates?

**Output Guidance**:
Start with TAM and work down to realistic SOM. Be explicit about calculation methods and assumptions. State confidence levels (high/medium/low) for each estimate. Identify the most attractive 2-3 segments for initial focus.

---

### --- Section 2: Market Dynamics & Growth Drivers ---

**Purpose**: Understand what''s driving market evolution and whether trends favor our entry.

**Analysis Framework**:
- **Growth Trajectory**: Historical growth and future projections with rationale
- **Demand Drivers**: Technology, regulatory, economic, or social forces
- **Supply Evolution**: How solutions/competitors are evolving
- **Adoption Stage**: Early adopters vs. mainstream vs. laggards
- **Trend Sustainability**: Which drivers are durable vs. temporary

**Key Questions**:
- What''s driving market growth or decline?
- Are these drivers accelerating or decelerating?
- Where is the market in the adoption lifecycle?
- What could disrupt current trajectories?
- How sustainable are growth assumptions?

**Output Guidance**:
Focus on 3-5 key drivers that most impact opportunity. Distinguish between proven trends and speculation. Assess whether we''re early, on-time, or late to market. Include both positive drivers and potential headwinds.

---

### --- Section 3: Competitive Landscape & Positioning ---

**Purpose**: Map competitive environment and identify where we can differentiate.

**Analysis Framework**:
- **Direct Competitors**: Who targets same customers with similar solutions
- **Indirect Competition**: Alternative ways customers solve the problem
- **Competitive Dynamics**: Market share trends, funding, strategic moves
- **Differentiation Opportunities**: Gaps in current offerings
- **Barriers & Moats**: What protects incumbents or enables disruption

**Key Questions**:
- Who are the main competitors and what''s their approach?
- What are customers using today instead?
- Where are competitors strong vs. vulnerable?
- What unique advantages could we leverage?
- How intense is competition likely to become?

**Output Guidance**:
Create a clear competitive map. Don''t just list competitors - analyze their strategies and performance. Identify specific gaps we could exploit. Be realistic about competitive intensity and our ability to differentiate.

---

### --- Section 4: Market Entry Barriers & Enablers ---

**Purpose**: Assess what helps or hinders market entry for a corporate innovator.

**Analysis Framework**:
- **Regulatory Environment**: Licenses, compliance requirements, policy direction
- **Technical Standards**: Industry standards, interoperability requirements
- **Customer Barriers**: Switching costs, buying processes, risk aversion
- **Channel Requirements**: Distribution, partnerships, or platform access needed
- **Corporate Assets**: What existing advantages can we leverage

**Key Questions**:
- What regulatory hurdles must we clear?
- How difficult is customer acquisition?
- What partnerships or channels are essential?
- Which corporate assets provide advantage?
- What''s the total cost/time to market entry?

**Output Guidance**:
Be specific about barriers - don''t just say "regulatory challenges." Quantify time and cost where possible. Equally important: identify enablers and advantages from corporate assets. Assess if barriers are surmountable with reasonable effort.

---

### --- Section 5: Market Validation Strategy ---

**Purpose**: Define how to validate market assumptions before major investment.

**Analysis Framework**:
- **Critical Assumptions**: Market beliefs that must be true for success
- **Validation Methods**: Research, pilots, or experiments to test assumptions
- **Early Indicators**: Signals that confirm or refute market opportunity
- **Information Sources**: Where to get reliable market data
- **Decision Triggers**: What findings would accelerate, pivot, or kill initiative

**Key Questions**:
- What market assumptions are we making?
- How can we test these with minimal resources?
- What early signals indicate market readiness?
- Who can provide reliable market insight?
- What findings would change our approach?

**Output Guidance**:
List 3-5 critical market assumptions ranked by importance. Propose specific validation activities with timelines and costs. Include both primary research (customer interviews) and secondary (reports, data). Define clear go/no-go criteria based on market findings.

---

## General Guidance for All Sections

1. **Market Realism**: Challenge optimistic market projections from pitch decks by:
   - Checking multiple sources for market size
   - Looking for cherry-picked data
   - Questioning hockey-stick growth assumptions

2. **Corporate Perspective**: Consider market factors unique to corporate innovation:
   - Impact on existing business lines
   - Ability to leverage current market presence
   - Strategic value beyond financial returns
   - Risk of market cannibalization

3. **Evidence Quality**: Always indicate source credibility:
   - Primary research > Industry analysts > News articles > Pitch deck claims
   - Note when multiple sources agree or conflict
   - Flag when relying on limited or dated information

4. **Confidence Levels**: Be explicit about market certainty:
   - High: Multiple credible sources align, clear trends
   - Medium: Some evidence but gaps remain
   - Low: Limited data, conflicting signals, or rapid change

5. **Action Orientation**: Every section should inform whether the market opportunity justifies investment and what to validate first.
Follow the recommended structure strictly and satisfy all criteria. Use information from AVAILABLE_CONTENT_BLOCKS below. You must cite all sources as inline, clickable Markdown links (e.g., "[Source Name](https://example.com)"). Both web research and information from documents must be cited. At the end of the chapter, you must also provide a consolidated, bulleted list of all sources cited under the heading "Sources Used:", with each source formatted as a clickable Markdown link.'
)
ON CONFLICT (name) DO NOTHING;