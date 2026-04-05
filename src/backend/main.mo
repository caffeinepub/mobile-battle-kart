import Array "mo:core/Array";
import List "mo:core/List";
import Text "mo:core/Text";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";

actor {
  type ScoreEntry = {
    playerName : Text;
    score : Nat;
  };

  module ScoreEntry {
    public func compare(entry1 : ScoreEntry, entry2 : ScoreEntry) : Order.Order {
      Nat.compare(entry2.score, entry1.score);
    };
  };

  let scoreList = List.empty<ScoreEntry>();

  public shared ({ caller }) func submitScore(playerName : Text, score : Nat) : async () {
    if (playerName.isEmpty()) { Runtime.trap("Player name cannot be empty") };
    let newEntry : ScoreEntry = {
      playerName;
      score;
    };
    scoreList.add(newEntry);
  };

  public query func getTopScores() : async [ScoreEntry] {
    let sortedScores = scoreList.toArray().sort();
    let topScores = Array.tabulate(
      if (sortedScores.size() < 10) { sortedScores.size() } else { 10 },
      func(i) { sortedScores[i] },
    );
    topScores;
  };
};
