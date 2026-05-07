Feature: Study Sessions — Log and Validate (#19)
  As a logged-in student
  I want to log study sessions against my goals
  So that my progress is tracked accurately

  Background:
    Given I am logged in as "demo@studysprint.app" with password "demo123"
    And I navigate to the first goal on the dashboard

  # Issue #19 — Validation for session duration
  Scenario: Logging a session with valid duration
    When I open the log session modal
    And I set the session duration to "1"
    And I save the session
    Then the session modal should close
    And the recent sessions list should be visible

  Scenario: Session is rejected when duration is zero
    When I open the log session modal
    And I set the session duration to "0"
    And I save the session
    Then I should see the session duration error "Duration must be greater than 0 hours."
    And the session modal should remain open

  Scenario: Session is rejected when duration is negative
    When I open the log session modal
    And I set the session duration to "-5"
    And I save the session
    Then I should see the session duration error "Duration must be greater than 0 hours."
    And the session modal should remain open
