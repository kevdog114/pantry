'use strict';

const { type } = require('os');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {

    await queryInterface.addColumn("Products", "freezerLifespanDays", {allowNull: true,type: Sequelize.INTEGER});
    await queryInterface.addColumn("Products", "refrigeratorLifespanDays", {allowNull: true,type: Sequelize.INTEGER});
    await queryInterface.addColumn("Products", "openedLifespanDays", {allowNull: true,type: Sequelize.INTEGER});

    await queryInterface.addColumn("ProductBarcodes", "brand", { type: Sequelize.STRING});
    await queryInterface.addColumn("ProductBarcodes", "quantity", { type: Sequelize.DECIMAL});
    await queryInterface.addColumn("ProductBarcodes", "description", { type: Sequelize.STRING});

    await queryInterface.addColumn("StockItems", "ProductBarcodeId", { type: Sequelize.INTEGER});
    await queryInterface.addColumn("StockItems", "isOpened", { type: Sequelize.BOOLEAN});
    await queryInterface.addColumn("StockItems", "isFrozen", { type: Sequelize.BOOLEAN});
    await queryInterface.addColumn("StockItems", "expirationExtensionAfterThaw", { type: Sequelize.INTEGER});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Products", "freezerLifespanDays");
    await queryInterface.removeColumn("Products", "refrigeratorLifespanDays");
    await queryInterface.removeColumn("Products", "openedLifespanDays");

    await queryInterface.removeColumn("ProductBarcodes", "brand");
    await queryInterface.removeColumn("ProductBarcodes", "quantity");
    await queryInterface.removeColumn("ProductBarcodes", "description");

    await queryInterface.removeColumn("StockItems", "ProductBarcodeId");
    await queryInterface.removeColumn("StockItems", "isOpened");
    await queryInterface.removeColumn("StockItems", "isFrozen");
    await queryInterface.removeColumn("StockItems", "expirationExtensionAfterThaw");

  }
};
