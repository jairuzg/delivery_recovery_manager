const {transformQuoteToOrder} = require("../services/orders");
const {getMysqlConnection} = require("./mysql_connections");
const {logger} = require("../common/logger");

function fetchPaymentsWithoutExternalDBId(connMysql, callback) {
    let sql = "select p.pago, p.ordenID, p.numero_cc, p.fecha_transaccion, p.estado_transaccion, " +
        " p.exp_mes, p.exp_anio, p.external_db_id, c.servidor " +
        " from pago p " +
        " join cotizacion_msj c on c.cotizacion_msj = p.ordenID" +
        " where p.external_db_id is null ";
    connMysql.query(sql, (errors, rows, fields) => {
        if (!errors && rows.length) {
            let pagos = JSON.parse(JSON.stringify(rows));
            callback(null, pagos);
        } else {
            callback(errors, []);
        }
    });
}

async function savePaymentInExternalDB(fbConn, fbPayment){
    let errorFb;
    await fbConn.collection("payments").add(fbPayment).then(docRef => {
        // console.log(`Successfully wrote order ${fbOrder.ordenID} into Firestore with Document ID ${docRef.id}`);
        fbPayment.firebaseId = docRef.id;
    }).catch(err => {
        errorFb = err;
        // console.log(`There was an error when trying to insert the order ${fbOrder.ordenID} in Firestore ${err.message}`);
    });
    return {errorFb, fbPayment: fbPayment};
}

function updatePaymentExternalDBIdByOrderId(connMysql, fbPayment, callback){
    let sql = "update payment set external_db_id = ? where ordenID = ?";

    connMysql.query(sql, [fbPayment.firebaseId, fbPayment.ordenID], (errors, result) => {
        if(!errors) {
            console.log(`Successfully updated paymetn with order ${fbPayment.ordenID} in server ${fbPayment.servidor}` );
            callback(null, true);
        } else {
            callback(errors.message, false);
        }
    });
}

async function deletePaymentInExternalDB(fbConn, fbPayment){
    let errorFb;
    await fbConn.collection("payments").doc(fbPayment.firebaseId).delete().then(docRef => {
        console.log(`Successfully deleted payment with order ${fbPayment.ordenID} from Firestore with Document ID ${fbPayment.firebaseId}`);
    }).catch(err => {
        errorFb = err;
        console.log(`There was an error when trying to delete the payment with orderId ${fbPayment.ordenID} in Firestore ${err.message}`);
    });
    return {errorFb, fbPayment: fbPayment};
}

module.exports = {
    fetchPaymentsWithoutExternalDBId: fetchPaymentsWithoutExternalDBId,
    savePaymentInExternalDB: savePaymentInExternalDB,
    updatePaymentExternalDBIdByOrderId: updatePaymentExternalDBIdByOrderId,
    deletePaymentInExternalDB: deletePaymentInExternalDB
};