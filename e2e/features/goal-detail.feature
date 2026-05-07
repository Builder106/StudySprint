Feature: Goal Detail — Panel and Timer (#12, #16)
  As a logged-in student
  I want to interact with the goal detail page
  So that I can track sessions and use the timer

  Background:
    Given I am logged in as "demo@studysprint.app" with password "demo123"
    And I navigate to the first goal on the dashboard

  Scenario: Opening the slide-out details panel
    Then the goal details panel should be visible
    And I should see the "Target" metadata in the panel

  Scenario: Switching the timer to Pomodoro mode
    When I click the "Pomodoro" mode button on the timer
    Then the timer should show the "Focus" phase label
    And the timer display should show "25:00"

  Scenario: Starting and pausing the stopwatch timer
    When I click the Start button on the timer
    Then the timer should be running
    When I click the Pause button on the timer
    Then the timer should be paused
