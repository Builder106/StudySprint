Feature: Demo — Core Workflow
  Register, see seeded dashboard, create a goal, log a session.

  Scenario: New student registers and logs their first session
    Given I am on the StudySprint home page
    When I navigate to the registration page
    And I enter the email "example@example.com" and password "password123"
    And I submit the registration form
    Then I should be redirected to the dashboard
    When I navigate to the new goal page
    And I enter the title "Master Calculus II"
    And I set the target hours to "20"
    And I submit the new goal form
    Then I should be redirected to the goal detail page
    When I open the log session modal
    And I set the session duration to "1.5"
    And I save the session
    Then the session modal should close
    And the recent sessions list should be visible
