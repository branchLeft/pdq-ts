/** Meta's suggested match threshold: a match when hammingDistance(a, b) <= 31.
 * Source: python-threatexchange pdq_utils.py (PDQ_CONFIDENT_MATCH_THRESHOLD),
 * also pdq/README.md. */
export const PDQ_MATCH_DISTANCE_THRESHOLD = 31;

/** Meta's suggested quality threshold: a hash whose quality is below 50 is
 * discarded. Source: python-threatexchange signal.py (QUALITY_THRESHOLD), and
 * pdq/README.md (discard at quality <= 49). */
export const PDQ_QUALITY_THRESHOLD = 50;
