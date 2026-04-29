Feature: Demo — Timer and Focus Tools
  Switch between Pomodoro and Stopwatch, start a timer, open focus tools.

  Background:
    Given I am logged in as "demo@example.com" with password "demo123"
    And I navigate to the first goal on the dashboard

  Scenario: Demonstrate timer modes and focus tools
    When I click the "Pomodoro" mode button on the timer
    Then the timer should show the "Focus" phase label
    And the timer display should show "25:00"
    When I click the "Stopwatch" mode button on the timer
    And I click the Start button on the timer
    Then the timer should be running
    When I click the Pause button on the timer
    Then the timer should be paused
    When I open the focus tools panel
    Then the ambient noise controls should be visible
