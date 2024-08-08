import json
import re

def parse_review_summary(summary_str):
    # Define regex patterns
    positive_pattern = r"\*\*Key Positive Points:\*\*\n- (.+?)(?=\n\n\*\*|$)"
    negative_pattern = r"\*\*Key Negative Points:\*\*\n- (.+?)(?=\n\n\*\*|$)"
    overall_pattern = r"\*\*Overall Impression:\*\*\n(.+)"

    # Extract positive points
    positive_match = re.search(positive_pattern, summary_str, re.DOTALL)
    positive_points = positive_match.group(1).split("\n- ") if positive_match else []

    # Extract negative points
    negative_match = re.search(negative_pattern, summary_str, re.DOTALL)
    negative_points = negative_match.group(1).split("\n- ") if negative_match else []

    # Extract overall impression
    overall_match = re.search(overall_pattern, summary_str, re.DOTALL)
    overall_impression = overall_match.group(1).strip() if overall_match else ""

    # Create the dictionary
    review_summary = {
                "key_positives": positive_points,
                "key_negatives": negative_points,
                "overall_impression": overall_impression
            }
     

    return review_summary
