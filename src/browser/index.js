// @flow
import type { FrecencyData, FrecencyOptions, SaveParams, SortParams } from './types';

class Frecency {
  // Used to create key that will be used to save frecency data in localStorage.
  _key: string;
  // Max number of timestamps to save for recent selections of a result.
  _timestampsLimit: number;
  // Max number of IDs that should be stored in frecency to limit the object size.
  _recentSelectionsLimit: number;
  // Attribute to use as the search result's id.
  _idAttribute: string | Function;

  _frecency: FrecencyData;

  constructor({ key, timestampsLimit, recentSelectionsLimit, idAttribute }: FrecencyOptions) {
    if (!key) throw new Error('key is required.');

    this._key = key;
    this._timestampsLimit = timestampsLimit || 10;
    this._recentSelectionsLimit = recentSelectionsLimit || 100;
    this._idAttribute = idAttribute || '_id';

    this._frecency = this._getFrecencyData();
  }

  /**
   * Updates frecency data after user selects a result.
   * @param {Object} params
   *   @prop {String} searchQuery - The search query the user entered.
   *   @prop {String} selectedId - String representing the ID of the search result selected.
   */
  save({ searchQuery, selectedId }: SaveParams): void {
    if (!searchQuery || !selectedId) return;

    const now = Date.now();

    // Reload frecency here to pick up frecency updates from other tabs.
    const frecency = this._getFrecencyData();

    this._updateFrecencyByQuery(frecency, searchQuery, selectedId, now);
    this._updateFrecencyById(frecency, searchQuery, selectedId, now);

    this._cleanUpOldSelections(frecency, selectedId);
    this._saveFrecencyData(frecency);

    this._frecency = frecency;
  }

  // Returns the key that will be used to save frecency data in storage.
  _getFrecencyKey(): string {
    return `frecency_${this._key}`;
  }

  // Reads frecency data from storage and returns the frecency object if
  // the stored frecency data is valid.
  _getFrecencyData(): FrecencyData {
    const defaultFrecency: FrecencyData = {
      queries: {},
      selections: {},
      recentSelections: []
    };

    const savedData = localStorage.getItem(this._getFrecencyKey());
    if (!savedData) return defaultFrecency;

    try {
      return JSON.parse(savedData);
    } catch (e) {
      return defaultFrecency;
    }
  }

  /**
   * Save frecency data back to storage.
   * @param {FrecencyData} frecency
   */
  _saveFrecencyData(frecency: FrecencyData): void {
    localStorage.setItem(this._getFrecencyKey(), JSON.stringify(frecency));
  }

  /**
   * Updates frecency by the search query the user entered when selecting a result.
   * @param {FrecencyData} frecency - Frecency object to be modified in place.
   * @param {String} searchQuery - Search query the user entered.
   * @param {String} selectedId - ID of search result the user selected.
   * @param {Number} now - Current time in milliseconds.
   */
  _updateFrecencyByQuery(frecency: FrecencyData, searchQuery: string, selectedId: string,
    now: number): void {

    const queries = frecency.queries;
    if (!queries[searchQuery]) queries[searchQuery] = [];

    const previousSelection = queries[searchQuery].find((selection) => {
      return selection.id === selectedId;
    });

    // If this ID was not selected previously for this search query, we'll
    // create a new entry.
    if (!previousSelection) {
      queries[searchQuery].push({
        id: selectedId,
        timesSelected: 1,
        selectedAt: [now]
      });
      return;
    }

    // Otherwise, increment the previous entry.
    previousSelection.timesSelected += 1;
    previousSelection.selectedAt.push(now);

    // Limit the selections timestamps.
    previousSelection.selectedAt = previousSelection.selectedAt
      .slice(1, this._timestampsLimit + 1);
  }

  /**
   * Updates frecency by the ID of the result selected.
   * @param {FrecencyData} frecency - Frecency object to be modified in place.
   * @param {String} searchQuery - Search query the user entered.
   * @param {String} selectedId - ID of search result the user selected.
   * @param {Number} now - Current time in milliseconds.
   */
  _updateFrecencyById(frecency: FrecencyData, searchQuery: string, selectedId: string,
    now: number): void {

    const selections = frecency.selections;
    const previousSelection = selections[selectedId];

    // If this ID was not selected previously, we'll create a new entry.
    if (!previousSelection) {
      selections[selectedId] = {
        timesSelected: 1,
        selectedAt: [now],
        queries: { [searchQuery]: true }
      };
      return;
    }

    // Otherwise, update the previous entry.
    previousSelection.timesSelected += 1;
    previousSelection.selectedAt.push(now);

    // Limit the selections timestamps.
    previousSelection.selectedAt = previousSelection.selectedAt
      .slice(1, this._timestampsLimit + 1);

    // Remember which search queries this result was selected for so we can
    // remove this result from frecency later when cleaning up.
    previousSelection.queries[searchQuery] = true;
  }

  /**
   * Remove the oldest IDs in the frecency data once the number of IDs
   * saved in frecency has exceeded the limit.
   * @param {FrecencyData} frecency - Frecency object to be modified in place.
   * @param {String} selectedId - ID of search result the user selected.
   */
  _cleanUpOldSelections(frecency: FrecencyData, selectedId: string): void {
    const recentSelections = frecency.recentSelections;

    // If frecency already contains the selected ID, shift it to the front.
    if (recentSelections.includes(selectedId)) {
      frecency.recentSelections = [
        selectedId,
        ...recentSelections.filter((id) => id !== selectedId)
      ];
      return;
    }

    // Otherwise add the selected ID to the front of the list.
    if (recentSelections.length < this._recentSelectionsLimit) {
      frecency.recentSelections = [
        selectedId,
        ...recentSelections
      ];
      return;
    }

    // If the number of recent selections has gone over the limit, we'll remove
    // the least recently used ID from the frecency data.
    const idToRemove = recentSelections.pop();

    frecency.recentSelections = [
      selectedId,
      ...recentSelections
    ];

    const selectionById = frecency.selections[idToRemove];
    if (!selectionById) return;
    delete frecency.selections[idToRemove];

    Object.keys(selectionById.queries).forEach((query) => {
      frecency.queries[query] = frecency.queries[query].filter((selection) => {
        return selection.id !== idToRemove;
      });

      if (frecency.queries[query].length === 0) {
        delete frecency.queries[query];
      }
    });
  }

  /**
   * Sorts a list of search results based on the saved frecency data.
   * @param {Object} params
   *   @prop {String} searchQuery - The search query the user entered.
   *   @prop {Object[]} results - The list of search results to sort.
   * @return {Object[]} A copy of the search results sorted by frecency.
   */
  sort({ searchQuery, results }: SortParams): Object[] {
    this._calculateFrecencyScores(results, searchQuery);

    // For recent selections, sort by frecency. Otherwise, fall back to
    // server-side sorting.
    const recentSelections = results.filter((result) => result._frecencyScore > 0);
    const otherSelections = results.filter((result) => result._frecencyScore === 0);

    const sortedResults = [
      ...recentSelections.sort((b, a) => b._frecencyScore - a._frecencyScore),
      ...otherSelections
    ];

    return sortedResults.map((result) => {
      delete result._frecencyScore;
      return result;
    });
  }

  /**
   * Returns the ID of a search result that will be used for sorting.
   * @param {Object} result - Search result to retrieve the ID from.
   * @return {String} The ID of the search result.
   */
  _getId(result: Object): string {
    if (typeof this._idAttribute === 'function') {
      return this._idAttribute(result);
    } else {
      return result[this._idAttribute];
    }
  }

  /**
   * Calculates frecency scores for each search results and saves the score
   * on the result object.
   * @param {Object[]} results - List of search results to calculate scores for.
   * @param {String} searchQuery - Search query the user entered.
   */
  _calculateFrecencyScores(results: Object[], searchQuery: string): void {
    const now = Date.now();

    results.forEach((result) => {
      const resultId = this._getId(result);

      // Try calculating frecency score by exact query match.
      const frecencyForQuery = this._frecency.queries[searchQuery];

      if (frecencyForQuery) {
        const selection = frecencyForQuery.find((selection) => {
          return selection.id === resultId;
        });

        if (selection) {
          result._frecencyScore = this._calculateScore(selection.selectedAt,
            selection.timesSelected, now);
          return;
        }
      }

      // Try calculating frecency score by sub-query match.
      const subQueries = Object.keys(this._frecency.queries).filter((query) => {
        return query.toLowerCase().startsWith(searchQuery.toLowerCase());
      });

      // Use for-loop to allow early-return.
      for (const subQuery of subQueries) {
        const selection = this._frecency.queries[subQuery].find((selection) => {
          return selection.id === resultId;
        });

        if (selection) {
          // Reduce the score because this is not an exact query match.
          result._frecencyScore = 0.7 * this._calculateScore(selection.selectedAt,
            selection.timesSelected, now);
          return;
        }
      }

      // Try calculating frecency score by ID.
      const selection = this._frecency.selections[resultId];
      if (selection) {
        // Reduce the score because this is not an exact query match.
        result._frecencyScore = 0.5 * this._calculateScore(selection.selectedAt,
          selection.timesSelected, now);
        return;
      }

      result._frecencyScore = 0;
    });
  }

  /**
   * Calculates a frecency score based on the timestamps a resources was selected,
   * the total number of times selected, and the current time.
   * @param {Number[]} timestamps - Timestamps of recent selections.
   * @param {Number} timesSelected - Total number of times selected.
   * @param {Number} now - Current time in milliseconds.
   * @return {Number} The calculated frecency score.
   */
  _calculateScore(timestamps: number[], timesSelected: number, now: number): number {
    if (timestamps.length === 0) return 0;

    const hour = 1000 * 60 * 60;
    const day = 24 * hour;

    const totalScore = timestamps.reduce((score, timestamp) => {
      if (timestamp >= now - 3 * hour) return score + 100;
      if (timestamp >= now - day) return score + 80;
      if (timestamp >= now - 3 * day) return score + 60;
      if (timestamp >= now - 7 * day) return score + 30;
      if (timestamp >= now - 14 * day) return score + 10;
      return score;
    }, 0);

    return timesSelected * (totalScore / timestamps.length);
  }
}

export default Frecency;
