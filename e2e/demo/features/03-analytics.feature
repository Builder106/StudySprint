Feature: Demo — Analytics and Garden
  Walk through the analytics dashboard and the gamification garden.

  Background:
    Given I am logged in as "demo@example.com" with password "demo123"

  Scenario: Demonstrate analytics heatmap and garden plant
    When I navigate to the analytics page
    Then I should see the contribution heatmap
    When I navigate to the garden page
    Then I should see the XP bar
    And I should see the virtual plant
