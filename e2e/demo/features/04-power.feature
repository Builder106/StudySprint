Feature: Demo — AI Syllabus and Community
  Open the AI syllabus parser, then create a study room.

  Background:
    Given I am logged in as "demo@example.com" with password "demo123"

  Scenario: Demonstrate syllabus parser and study rooms
    When I open the syllabus import modal
    Then the syllabus import modal should be visible
    When I close the syllabus import modal
    And I navigate to the community page
    And I click the "New room" button
    Then the create room modal should appear
    When I enter the room name "Demo Study Room"
    And I submit the create room form
    Then I should see "Demo Study Room" in the rooms list
