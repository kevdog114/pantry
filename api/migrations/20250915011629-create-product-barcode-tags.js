'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('ProductBarcodeTags', {
      ProductBarcodeId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'ProductBarcodes',
          key: 'id'
        }
      },
      TagId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'Tags',
          key: 'id'
        }
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down (queryInterface, Sequelize) {

    await queryInterface.dropTable('ProductBarcodeTags');
  }
};
