Feature: Study Goals
  As a logged-in student
  I want to create and manage study goals
  So that I can track my progress toward each learning target

  Background:
    Given I am logged in as "demo@studysprint.app" with password "demo123"

  Scenario: Creating a new study goal with valid inputs
    When I navigate to the new goal page
    And I enter the title "Learn TypeScript generics"
    And I set the target hours to "20"
    And I submit the new goal form
    Then I should be redirected to the goal detail page
    And I should see "Learn TypeScript generics" as the goal title

  Scenario: Creating a goal fails when target hours is zero
    When I navigate to the new goal page
    And I enter the title "Invalid Goal"
    And I set the target hours to "0"
    And I submit the new goal form
    Then I should see the hours validation error "Must be greater than 0"
    And I should remain on the new goal page

  Scenario: Dashboard shows existing goals
    When I navigate to the dashboard
    Then I should see at least one goal card

  Scenario: Deleting a study goal from the dashboard
    Given I have a goal titled "Goal to Delete" with 5 target hours
    When I navigate to the dashboard
    And I right-click on the "Goal to Delete" goal row
    And I click "Delete goal" in the context menu
    Then the goal "Goal to Delete" should no longer appear on the dashboard
