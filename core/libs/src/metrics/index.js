"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetrics = createMetrics;
const prom_client_1 = require("prom-client");
function createMetrics(serviceName) {
    const registry = new prom_client_1.Registry();
    registry.setDefaultLabels({ service: serviceName });
    (0, prom_client_1.collectDefaultMetrics)({ register: registry });
    return {
        registry,
        counter(name, help, labelNames = []) {
            return new prom_client_1.Counter({ name, help, labelNames, registers: [registry] });
        },
        gauge(name, help, labelNames = []) {
            return new prom_client_1.Gauge({ name, help, labelNames, registers: [registry] });
        },
        histogram(name, help, labelNames = [], buckets) {
            return new prom_client_1.Histogram({
                name,
                help,
                labelNames,
                buckets,
                registers: [registry],
            });
        },
        async metrics() {
            return registry.metrics();
        },
        contentType() {
            return registry.contentType;
        },
    };
}
//# sourceMappingURL=index.js.map