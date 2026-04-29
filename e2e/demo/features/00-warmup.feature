Feature: Warmup
  Playwright drops video frames on certain early test slots in single-worker
  runs with slowMo + video. Two warmup scenarios absorb the bug; their empty
  webms get cleaned up by the reporter.

  Scenario: Warmup A
    Given I am on the StudySprint home page

  Scenario: Warmup B
    Given I am on the StudySprint home page
