Feature: Social Features — Study Rooms (#18)
  As a logged-in student
  I want to create study rooms
  So that I can study with others

  Background:
    Given I am logged in as "demo@studysprint.app" with password "demo123"

  Scenario: Creating a new study room
    When I navigate to the community page
    And I click the "New room" button
    Then the create room modal should appear
    When I enter the room name "E2E Test Room"
    And I submit the create room form
    Then I should see "E2E Test Room" in the rooms list
