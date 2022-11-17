const {getMysqlConnection} = require("../db/mysql_connections");
const {logger} = require("../common/logger");
const {
    savePaymentInExternalDB,
    updatePaymentExternalDBIdByOrderId,
    deletePaymentInExternalDB
} = require("../db/payments");

function transformPaymentToPaymentFb(payment) {
    return {
        "paymentId": payment['pago'],
        "ordenID": payment['ordenID'],
        "estadoTransaccion": payment['estado_transaccion'],
        "fechaTransaccion": payment['fecha_transaccion'],
        "servidor": payment['servidor']
    }
}

function transferPaymentsToExternalDB(connFb, payments, serverName) {
    let fbPayments = [];
    payments.forEach(payment => {
        fbPayments.push(transformPaymentToPaymentFb(payment));
    });
    fbPayments.forEach(fbPayment => {
        savePaymentInExternalDB(connFb, fbPayment).then(resp => {
            if (!resp.errorFb) {
                console.log(`Successfully wrote payment with orderId ${fbPayment.ordenID} from server ${serverName} to Firestore with Document ID ${resp.fbPayment.firebaseId}`);
                const connMysql = getMysqlConnection(serverName);
                updatePaymentExternalDBIdByOrderId(connMysql, resp.fbPayment, (errors, isOk) => {
                    if (!errors && isOk) {
                        console.log(`Successfully synchronized payment with orderId ${fbPayment.ordenID} from server ${serverName} with Firebase`);
                    } else {
                        deletePaymentInExternalDB(connFb, resp.fbPayment).then(resp => {
                            if (resp.errorFb) {
                                console.log(`Error while trying to delete the payment with orderId ${fbPayment.ordenID}, writing logs to manually fix it`);
                                logger.error({from: serverName, to: 'externalDB', data: fbPayment});
                            }
                        });
                    }
                });

            } else {
                console.log(`There was an error when trying to insert the payment with orderId ${fbPayment.ordenID} from server ${serverName} in Firestore ${resp.errorFb.message}`);
            }
        })
    });
}

module.exports = {
    transferPaymentsToExternalDB: transferPaymentsToExternalDB
};