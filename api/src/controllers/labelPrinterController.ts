import { NextFunction, Response, Request } from "express";

export const printLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var labelRequest = {
        "text": "na",
        "font_family": "DejaVu Serif (Book)",
        "font_size": "70",
        "label_size": "62",
        "align": "center",
        "margin_top": "10",
        "margin_bottom": "20",
        "margin_left": "20",
        "margin_right": "20",
        "product": req.params.productTitle,
        "duedate": "Use by: " + req.params.expiration + "  Qty: " + req.params.quantity,
        "grocycode": "ST-" + req.params.stockId
      };

    await fetch(process.env.LABEL_PRINTER_HOST + "/api/label", {
        method: 'POST',
        body: new URLSearchParams(labelRequest)
    });

    res.send({status: "ok"});
}

export const printQuickLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {

    var labelRequest = {
        "text": req.body.text,
        "font_size": "50",
        "label_size": "62",
        "align": "center"
    };

    await fetch(process.env.LABEL_PRINTER_HOST + "/api/label", {
        method: 'POST',
        body: new URLSearchParams(labelRequest)
    });

    res.send({status: "ok"});
}