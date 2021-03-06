# Frecency

Plugin to add frecency to search results. Original blog post on Frecency by Slack:<br> https://slack.engineering/a-faster-smarter-quick-switcher-77cbc193cb60

## Using The Module

Install the npm module:
```sh
npm install frecency
```

Import Frecency into your code and create an instance of Frecency.
```js
import Frecency from 'frecency';

export const peopleFrecency = new Frecency({
  key: 'people'   // Frecency data will be saved in localStorage with the key: 'frecency_people'.
});
```

When you select a search result in your code, update frecency:
```js
onSelect: (searchQuery, selectedResult) => {
  ...
  peopleFrecency.save({
    searchQuery,
    selectedId: selectedResult._id
  });
  ...
}
```

Before you display search results to your users, sort the results using frecency:
```js
onSearch: (searchQuery) => {
  ...
  // Search results received from a search API.
  const searchResults = [{
    _id: '57b409d4feea972a68ba1101',
    name: 'Brad Vogel',
    email: 'brad@mixmax.com'
  }, {
    _id: '57a09ceb7abdf9cb2c35818c',
    name: 'Brad Neuberg',
    email: 'neuberg@gmail.com'
  }, {
    ...
  }];

  return peopleFrecency.sort({
    searchQuery,
    results: searchResults
  });
}
```

Frecency adds and removes `_frecencyScore` attribute for compare results.
You can output results with scores by assigning `keepScores` parameter to `true`.

Keep the frecency score allow you to do extra operations like usage analytics, debugging
and/or mix with other algorithms.


## Configuring Frecency
Frecency will sort on the `_id` attribute by default. You can change this by setting an
`idAttribute` in the constructor:
```js
const frecency = new Frecency({
  key: 'people',
  idAttribute: 'id'
});

// OR

const frecency = new Frecency({
  key: 'people',
  idAttribute: 'email'
});

// Then when saving frecency, make sure to save the correct attribute as the selectedId.
frecency.save({
  searchQuery,
  selectedId: selectedResult.email
});

// `idAttribute` also accepts a function if your search results contain a
// mix of different types.
const frecency = new Frecency({
  key: 'people',
  idAttribute: (result) => result.id || result.email
});

// Depending on the result, save the appropriate ID in frecency.
frecency.save({
  searchQuery,
  selectedId: selectedResult.id
});

// OR

frecency.save({
  searchQuery,
  selectedId: selectedResult.email
});
```

Frecency saves timestamps of your recent selections to calculate a score and rank you results.
More timestamps means more granular frecency scores, but frecency data will take up more
space in localStorage.

You can modify the number of timestamps saved with an option in the constructor.
```js
new Frecency({
  key: 'people',
  timeStampsLimit: 20   // Limit is 10 by default.
});
```

Frecency stores a maximum number of IDs in localStorage. More IDs means more results
can be sorted with frecency, but frecency data takes up more space in localStorage.

To change the maximum number of different IDs stored in frecency:
```js
new Frecency({
  key: 'people',
  recentSelectionsLimit: 200   // Limit is 100 by default.
});
```

By default, frecency uses browser localStorage as storage provider in the browser environment.
You can pass your own storage provider that implements the API Web Storage interface.
For Node.js environment you can use a storage provider like [node-localstorage](https://github.com/lmaccherone/node-localstorage)
```js
const storageProviderFrecencyFilePath = path.join(app.getPath('userData'), 'frecency');
const storageProvider = new LocalStorage(storageProviderFrecencyFilePath);
new Frecency({
  key: 'people',
  storageProvider
});
```

### Configure weights

Differents weights are applied depending on what kind of match it is about

```js
new Frecency({
  key: 'people',
  exactQueryMatchWeight: 0.9, // default to 1.0
  subQueryMatchWeight: 0.5, // default to 0.7
  recentSelectionsMatchWeight: 0.1, // default to 0.5
});
```
