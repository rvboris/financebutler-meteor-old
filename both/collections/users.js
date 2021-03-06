const iterateCategories = (categories, callback = () => {}) => {
  categories.forEach(category => {
    if (category.children) {
      iterateCategories(category.children, callback);
    }

    callback(category);
  });
};

// Helpers
Meteor.users.helpers({
  getCurrency: function getAccount() {
    return G.CurrenciesCollection.findOne(this.profile.currencyId);
  },
});

// Hooks
const setupUserDefaultCollections = (userId, user) => {
  if (!user.profile.language) {
    return;
  }

  if (!G.UsersCategoriesCollection.findOne({userId})) {
    const categories = G.UsersDefaultCategoriesFixture[user.profile.language];

    iterateCategories(categories, category => {
      category._id = Random.id();

      if (!category.system) {
        category.system = false;
      }
    });

    G.UsersCategoriesCollection.insert({ userId, categories: categories });
  }

  if (!G.UsersAccountsCollection.findOne({userId})) {
    const accounts = G.UsersDefaultAccountsFixture[user.profile.language];
    const defaultAccountCurrency = G.CurrenciesCollection.findOne({
      code: user.profile.language === 'ru' ? 'RUB' : 'USD',
    });

    G.UsersAccountsCollection.insert({
      userId,
      accounts: accounts.map(account => {
        account._id = Random.id();
        account.currencyId = defaultAccountCurrency._id;

        return account;
      }),
    });
  }
};

Meteor.users.after.insert((userId, user) => {
  if (user.services.password) {
    setupUserDefaultCollections(user._id, user);
  }
});

Meteor.users.after.update((userId, user) => {
  if (!user.services) {
    setupUserDefaultCollections(user._id, user);
  }
});

Meteor.users.after.remove((userId, user) => {
  G.UsersCategoriesCollection.direct.remove({ userId: user._id });
  G.UsersAccountsCollection.direct.remove({ userId: user._id });
  G.UsersOperationsCollection.direct.remove({ userId: user._id });
});
