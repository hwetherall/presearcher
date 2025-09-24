-- Update the Foundation Report demo content with improved data

UPDATE public.demo_reports 
SET content = '# Your New Foundation Report Content Here

## Executive Summary

[Replace this with your improved content]

## Market Analysis

[Your improved market analysis content]

## Key Findings

[Your improved key findings]

## Recommendations

[Your improved recommendations]

'
WHERE report_type = 'foundation';
