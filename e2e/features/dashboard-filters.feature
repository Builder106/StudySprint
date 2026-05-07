Feature: Dashboard Filtering and Sorting (#21)
  As a logged-in student
  I want to filter and sort my goals on the dashboard
  So that I can focus on the most relevant goals

  Background:
    Given I am logged in as "demo@studysprint.app" with password "demo123"
    And I navigate to the dashboard

  Scenario: Filtering goals by Active status
    When I click the "Active" filter button
    Then I should only see goals with "Active" status badges

  Scenario: Sorting goals by most logged hours
    When I click the "Most logged" sort option
    Then the goals list should be displayed
