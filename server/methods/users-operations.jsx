const namespace = 'UsersOperations';

Meteor.methods({
  [`${namespace}/Add`]: (userId, accountId, operation) => {
    operation.date = moment.utc(operation.date || new Date()).toDate();

    const user = Meteor.users.findOne(userId);

    if (!user) {
      throw new Meteor.Error('ERROR.USER_NOT_FOUND', 'User is not found');
    }

    const account = G.UsersAccountsCollection.findOne({userId}).getAccount(accountId);

    if (!account) {
      throw new Meteor.Error('ERROR.ACCOUNT_NOT_FOUND', 'Account is not found');
    }

    const operationCurrency = G.CurrenciesCollection.findOne(account.currencyId);

    if (operation.categoryId) {
      const category = G.UsersCategoriesCollection.findOne({userId}).getCategory(operation.categoryId);

      if (!category) {
        throw new Meteor.Error('ERROR.CATEGORY_NOT_FOUND', 'Category is not found');
      }
    }

    if (!operation.type) {
      throw new Meteor.Error('ERROR.OPERATION_TYPE_REQUIRED', 'Operation type is required');
    }

    if (['expense', 'income'].indexOf(operation.type) < 0) {
      throw new Meteor.Error('ERROR.INVALID_OPERATION_TYPE', 'Invalid operation type');
    }

    if (!operation.amount) {
      throw new Meteor.Error('ERROR.OPERATION_AMOUNT_REQUIRED', 'Operation amount is required');
    }

    operation.amount = +parseFloat(operation.amount).toFixed(operationCurrency.decimalDigits);

    if (!_.isNumber(operation.amount) || _.isNaN(operation.amount) || !_.isFinite(operation.amount)) {
      throw new Meteor.Error('ERROR.OPERATION_AMOUNT_INVALID', 'Operation amount is invalid');
    }

    if (operation.amount === 0) {
      throw new Meteor.Error('ERROR.OPERATION_AMOUNT_NOT_NULL', 'Operation amount cannot be equal to 0');
    }

    if (operation.type === 'expense' && operation.amount > 0) {
      throw new Meteor.Error('ERROR.EXPENSE_OPERATION_NEGATIVE', 'Expense operation must be negative');
    }

    if (operation.type === 'income' && operation.amount < 0) {
      throw new Meteor.Error('ERROR.INCOME_OPERATION_POSITIVE', 'Income operation must be positive');
    }

    if (operation.type === 'expense' && -operation.amount > account.currentBalance) {
      throw new Meteor.Error('ERROR.OPERATION_NOT_ENOUGH_MONEY', 'On account of insufficient funds');
    }

    const operationToInsert = {
      userId: userId,
      accountId: accountId,
      type: operation.type,
      date: operation.date,
      amount: operation.amount,
    };

    if (operation.categoryId) {
      operationToInsert.categoryId = operation.categoryId;
    }

    return G.UsersOperationsCollection.insert(operationToInsert);
  },

  [`${namespace}/AddTransfer`]: (userId, accountIdFrom, accountIdTo, operation) => {
    operation.date = moment.utc(operation.date || new Date()).toDate();

    const accountFrom = G.UsersAccountsCollection.findOne({ userId }).getAccount(accountIdFrom);
    const accountFromCurrency = G.CurrenciesCollection.findOne(accountFrom.currencyId);
    const accountToCurrency = G.UsersAccountsCollection.findOne({ userId }).getCurrency(accountIdTo);

    let groupFromOperation;
    let groupToOperation;

    if (accountFromCurrency._id === accountToCurrency._id) {
      if (_.isObject(operation.amount)) {
        throw new Meteor.Error('ERROR.OPERATION_TRANSFER_AMOUNT_NUMBER_REQUIRED', 'Transfer operation require number amount');
      }

      if (operation.amount > accountFrom.currentBalance) {
        throw new Meteor.Error('ERROR.OPERATION_TRANSFER_NOT_ENOUGH_MONEY', 'On account of insufficient funds');
      }

      groupFromOperation = Meteor.call(`${namespace}/Add`, userId, accountIdFrom, {
        amount: operation.amount > 0 ? -(operation.amount) : operation.amount,
        date: operation.date,
        type: 'expense',
      });

      groupToOperation = Meteor.call(`${namespace}/Add`, userId, accountIdTo, {
        amount: operation.amount < 0 ? -(operation.amount) : operation.amount,
        date: operation.date,
        type: 'income',
      });
    } else {
      if (!_.isObject(operation.amount)) {
        throw new Meteor.Error('ERROR.OPERATION_TRANSFER_AMOUNT_OBJECT_REQUIRED', 'Transfer operation has different currency, required object amount');
      }

      if (!operation.amount.to && operation.amount.from) {
        operation.amount.to = fx(operation.amount.from).from(accountFromCurrency.code).to(accountToCurrency.code);
      } else if (!operation.amount.from && operation.amount.to) {
        operation.amount.from = fx(operation.amount.to).from(accountToCurrency.code).to(accountFromCurrency.code);
      } else {
        throw new Meteor.Error('ERROR.OPERATION_TRANSFER_AMOUNT_OBJECT_INVALID', 'Transfer operation amount object is invalid');
      }

      if (operation.from > accountFrom.currentBalance) {
        throw new Meteor.Error('ERROR.OPERATION_TRANSFER_NOT_ENOUGH_MONEY', 'On account of insufficient funds');
      }

      groupFromOperation = Meteor.call(`${namespace}/Add`, userId, accountIdFrom, {
        amount: operation.amount.from > 0 ? -(operation.amount.from) : operation.amount.from,
        date: operation.date,
        type: 'expense',
      });

      groupToOperation = Meteor.call(`${namespace}/Add`, userId, accountIdTo, {
        amount: operation.amount.to < 0 ? -(operation.amount.to) : operation.amount.to,
        date: operation.date,
        type: 'income',
      });
    }

    G.UsersOperationsCollection.direct.update(groupFromOperation, { $set: { groupTo: groupToOperation } });
    G.UsersOperationsCollection.direct.update(groupToOperation, { $set: { groupTo: groupFromOperation } });

    return groupFromOperation;
  },

  [`${namespace}/Update`]: (userId, operationId, operation) => {
    const fieldsToUpdate = {};

    const operationToUpdate = G.UsersOperationsCollection.findOne(operationId);

    if (!operationToUpdate) {
      throw new Meteor.Error('ERROR.OPERATION_NOT_FOUND', 'Operation is not found');
    }

    if (operation.amount) {
      const operationCurrency = G.UsersAccountsCollection.findOne({ userId }).getCurrency(operationToUpdate.accountId);

      operation.amount = +parseFloat(operation.amount).toFixed(operationCurrency.decimalDigits);

      if (!_.isNumber(operation.amount) || _.isNaN(operation.amount) || !_.isFinite(operation.amount)) {
        throw new Meteor.Error('ERROR.OPERATION_AMOUNT_INVALID', 'Operation amount is invalid');
      }

      if (operation.amount === 0) {
        throw new Meteor.Error('ERROR.OPERATION_AMOUNT_NOT_NULL', 'Operation amount cannot be equal to 0');
      }

      fieldsToUpdate.amount = operation.amount;
    }

    if (operation.categoryId) {
      const category = G.UsersCategoriesCollection.findOne({userId}).getCategory(operation.categoryId);

      if (!category) {
        throw new Meteor.Error('ERROR.CATEGORY_NOT_FOUND', 'Category is not found');
      }

      fieldsToUpdate.categoryId = operation.categoryId;
    }

    if (operation.accountId) {
      const account = G.UsersAccountsCollection.findOne({userId}).getAccount(operation.accountId);

      if (!account) {
        throw new Meteor.Error('ERROR.ACCOUNT_NOT_FOUND', 'Account is not found');
      }

      fieldsToUpdate.accountId = operation.accountId;
    }

    if (operation.date) {
      fieldsToUpdate.date = operation.date;
    }

    return G.UsersOperationsCollection.update({ userId, _id: operationId }, { $set: fieldsToUpdate });
  },

  [`${namespace}/UpdateTransfer`]: (userId, operationId, operation) => {
    const operationInfo =  G.UsersOperationsCollection.findOne(operationId);

    if (operation.amount) {
      if ((operationInfo.type === 'expense' && operation.amount > 0) || (operationInfo.type === 'income' && operation.amount < 0)) {
        operation.amount = -operation.amount;
      }
    }

    Meteor.call(`${namespace}/Update`, userId, operationId, operation);

    if (operation.amount) {
      operation.amount = -operation.amount;
    }

    if (operation.accountId) {
      delete operation.accountId;
    }

    Meteor.call(`${namespace}/Update`, userId, operationInfo.groupTo, operation);
  },

  [`${namespace}/Remove`]: (userId, operationId, removeAccount = false) => {
    const operationToRemove = G.UsersOperationsCollection.findOne(operationId);

    if (!operationToRemove) {
      throw new Meteor.Error('ERROR.OPERATION_NOT_FOUND', 'Operation is not found');
    }

    if (removeAccount) {
      G.UsersOperationsCollection.direct.remove(operationId);
    } else {
      G.UsersOperationsCollection.remove(operationId);
    }

    if (operationToRemove.groupTo) {
      G.UsersOperationsCollection.remove(operationToRemove.groupTo);
    }
  },

  [`${namespace}/GetBalanceForDate`]: (userId, accountId, date = moment.utc().toDate()) => {
    const operationsCount = G.UsersOperationsCollection.find({ userId, accountId }).count();

    if (operationsCount === 0) {
      return G.UsersAccountsCollection.findOne({ userId }).getAccount(accountId).startBalance;
    }

    const dayBalance = G.UsersOperationsCollection.findOne({
      userId,
      accountId,
      date: {
        $lte: moment.utc(date).endOf('day').toDate(),
      },
      dayBalance: {
        $exists: true,
      },
      balance: {
        $exists: false,
      },
    }, {
      sort: {
        date: -1,
      },
    });

    if (dayBalance) {
      let balance = dayBalance.dayBalance;

      G.UsersOperationsCollection.find({
        userId,
        accountId,
        dayBalance: {
          $exists: false,
        },
        balance: {
          $exists: true,
        },
        date: {
          $gte: moment.utc(dayBalance.date).toDate(),
          $lte: moment.utc(date).subtract(1, 'day').endOf('day').toDate(),
        },
      }).forEach(operation => {
        balance += operation.amount;
      });

      return balance;
    }

    return 0;
  },
});
