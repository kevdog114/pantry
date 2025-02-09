'use strict';

const queryTypes = require('sequelize/lib/query-types');


/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {

    await queryInterface.sequelize.query(`
      CREATE VIRTUAL TABLE product_fts USING fts5(
        title,
        content='Products',
        content_rowid='id',
        tokenize="porter trigram case_sensitive 0"
      )
      `);

      await queryInterface.sequelize.query(`
        CREATE TRIGGER product_fts_insert AFTER INSERT ON Products
        BEGIN
          INSERT INTO product_fts (rowid, title) VALUES (new.id, new.title);
        END;
      `);

      await queryInterface.sequelize.query(`
        CREATE TRIGGER product_fts_delete AFTER DELETE ON Products
        BEGIN
          INSERT INTO product_fts (product_fts, rowid, title) VALUES ('delete', old.id, old.title);
        END;
      `);

      await queryInterface.sequelize.query(`
        CREATE TRIGGER product_fts_update AFTER UPDATE ON Products
        BEGIN
          INSERT INTO product_fts (product_fts, rowid, title) VALUES ('delete', old.id, old.title);
          INSERT INTO product_fts (rowid, title) VALUES (new.id, new.title);
        END;
      `);

      await queryInterface.sequelize.query(`
        INSERT INTO product_fts (rowid, title)
        SELECT id, title FROM Products
      `);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.sequelize.query("DROP TABLE product_fts");
    ['product_fts_update', 'product_fts_insert', 'product_fts_delete'].forEach(async trigger => {
      await queryInterface.sequelize.query(`DROP TRIGGER ${trigger}`);
    });
  }
};
