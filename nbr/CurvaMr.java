package pcalc;

import java.util.ArrayList;
import java.util.List;

/* loaded from: CurvaMr.class */
public final class CurvaMr {

    /* renamed from: dados, reason: collision with root package name */
    private Dados f1dados;
    private List<double[]> esforcos;
    private List<double[]> secaoC;
    private List<double[]> secaoS;
    private double fyd;
    private double fcd;
    private double ec2;
    private double ecu;
    private double n;
    private double moduloS;
    private int tipoCurvaC;
    private List<double[][]> curvasMr = new ArrayList();
    private List<double[]> curvasNrdMrdx = new ArrayList();
    private List<double[]> curvasNrdMrdy = new ArrayList();
    private double xAnterior = 0.0d;
    private double limXMax = 0.0d;
    private double limXMin = 0.0d;

    public CurvaMr(Dados dados2) {
        String[] strNrd;
        this.esforcos = new ArrayList();
        this.secaoC = new ArrayList();
        this.secaoS = new ArrayList();
        this.f1dados = dados2;
        if (dados2.config.getFck() <= 0.5d) {
            this.n = 2.0d;
            this.ec2 = 2.0d;
            this.ecu = 3.5d;
        } else {
            this.n = 1.4d + (23.4d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
            this.ec2 = Math.min(2.0d + (0.085d * Math.pow((100.0d * dados2.config.getFck()) - 50.0d, 0.53d)), 2.6d);
            this.ecu = 2.6d + (35.0d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
        }
        this.fyd = dados2.config.getFyk() / dados2.config.getGamaS();
        this.fcd = dados2.config.getFck() / dados2.config.getGamaC();
        this.moduloS = dados2.config.getModEs();
        this.secaoC = dados2.resultados.getSecaoC();
        this.secaoS = dados2.resultados.getSecaoS();
        this.tipoCurvaC = dados2.config.getTipoCurvaC();
        this.esforcos = dados2.esforcos.getListaEsforcos();
        int nGrafico = dados2.config.getNGraficoMr() + 1;
        double gamaF = dados2.config.getGamaF();
        double nrdMin = 0.0d;
        double nrdMax = 0.0d;
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            nrdMin += fc(-this.ec2) * aci;
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            nrdMin += fs(-this.ec2) * asi;
            nrdMax += fs(10.0d) * asi;
        }
        for (int i3 = 0; i3 < this.esforcos.size(); i3++) {
            double[][] curvaMrI = new double[5][nGrafico];
            double nd = Double.valueOf(this.esforcos.get(i3)[0]).doubleValue() * gamaF;
            for (int j = 0; j < nGrafico; j++) {
                double tetaLN = ((j * 2) * 3.141592653589793d) / (nGrafico - 1);
                curvaMrI[0][j] = nd;
                curvaMrI[1][j] = tetaLN;
                if ((nrdMin <= nd) & (nd <= nrdMax)) {
                    double[] mr = calculaMr(nd, tetaLN);
                    curvaMrI[2][j] = mr[0];
                    curvaMrI[3][j] = mr[1];
                } else {
                    String[] strArr = {"", ""};
                    String[] strNsd = dados2.unidades.getUnForca(Math.abs(nd));
                    if (nd < 0.0d) {
                        strNrd = dados2.unidades.getUnForca(Math.abs(nrdMin));
                    } else {
                        strNrd = dados2.unidades.getUnForca(Math.abs(nrdMax));
                    }
                    String strErro = "A seção não resiste ao esforço normal solicitante (Nrd= " + strNrd[0] + strNrd[1] + " < Nsd= " + strNsd[0] + strNsd[1] + ").";
                    dados2.erros.setListaErroNrd(i3, strErro);
                    curvaMrI[2][j] = 0.0d;
                    curvaMrI[3][j] = 0.0d;
                }
            }
            this.curvasMr.add(curvaMrI);
        }
        this.curvasNrdMrdx.add(new double[]{momExt(-this.ec2)[1], nrdMin});
        this.curvasNrdMrdy.add(new double[]{momExt(-this.ec2)[0], nrdMin});
        for (int i4 = 1; i4 < nGrafico / 2; i4++) {
            double ndi = ((i4 * (nrdMax - nrdMin)) / (nGrafico / 2)) + nrdMin;
            this.curvasNrdMrdx.add(new double[]{calculaMr(ndi, 0.0d)[1], ndi});
            this.curvasNrdMrdy.add(new double[]{calculaMr(ndi, 1.5707963267948966d)[0], ndi});
        }
        this.curvasNrdMrdx.add(new double[]{momExt(10.0d)[1], nrdMax});
        this.curvasNrdMrdy.add(new double[]{momExt(10.0d)[0], nrdMax});
        for (int i5 = 1; i5 < nGrafico / 2; i5++) {
            double ndi2 = (((-i5) * (nrdMax - nrdMin)) / (nGrafico / 2)) + nrdMax;
            this.curvasNrdMrdx.add(new double[]{calculaMr(ndi2, 3.141592653589793d)[1], ndi2});
            this.curvasNrdMrdy.add(new double[]{calculaMr(ndi2, 4.71238898038469d)[0], ndi2});
        }
        this.curvasNrdMrdx.add(this.curvasNrdMrdx.get(0));
        this.curvasNrdMrdy.add(this.curvasNrdMrdy.get(0));
        dados2.resultados.setCurvasMr(this.curvasMr);
        dados2.resultados.setCurvasNrdMrdx(this.curvasNrdMrdx);
        dados2.resultados.setCurvasNrdMrdy(this.curvasNrdMrdy);
    }

    private double[] calculaMr(double nd, double tetaLN) {
        double x0;
        double xu;
        double xLn;
        double[] mr = new double[2];
        List<double[]> xyCRot = rotacionaXY(this.secaoC, tetaLN);
        List<double[]> xyAsRot = rotacionaXY(this.secaoS, tetaLN);
        double yCMin = 1.0E11d;
        double yCMax = -1.0E11d;
        double yAsMax = -1.0E11d;
        for (int i = 0; i < xyCRot.size(); i++) {
            yCMin = Math.min(xyCRot.get(i)[1], yCMin);
            yCMax = Math.max(xyCRot.get(i)[1], yCMax);
        }
        for (int i2 = 0; i2 < xyAsRot.size(); i2++) {
            yAsMax = Math.max(xyAsRot.get(i2)[1], yAsMax);
        }
        double d = yAsMax - yCMin;
        double f0 = 0.0d;
        double fu = 0.0d;
        if (tetaLN == 0.0d) {
            x0 = -d;
            xu = 2.0d * d;
        } else {
            x0 = this.limXMin;
            xu = this.limXMax;
        }
        double erroX = this.f1dados.config.getTolVarLn();
        double erroNd = this.f1dados.config.getTolSomaN();
        int cont = 0;
        int nCont = this.f1dados.config.getTolIt();
        double ecg = 0.0d;
        double fi = 0.0d;
        boolean stop = false;
        while (!stop) {
            f0 = funcX(x0, d, yCMin, yCMax, xyCRot, xyAsRot, nd)[0];
            if (f0 > 0.0d) {
                stop = true;
            } else {
                xu = x0;
                fu = f0;
                x0 -= x0 * 10.0d;
            }
        }
        boolean stop2 = false;
        while (!stop2) {
            fu = funcX(xu, d, yCMin, yCMax, xyCRot, xyAsRot, nd)[0];
            if (fu < 0.0d) {
                stop2 = true;
            } else {
                x0 = xu;
                f0 = fu;
                xu += xu * 10.0d;
            }
        }
        this.limXMin = x0;
        this.limXMax = xu;
        boolean stop3 = false;
        while (!stop3) {
            if ((cont == 0) & (tetaLN != 0.0d)) {
                xLn = this.xAnterior;
            } else {
                xLn = ((x0 * fu) - (xu * f0)) / (fu - f0);
            }
            double[] res = funcX(xLn, d, yCMin, yCMax, xyCRot, xyAsRot, nd);
            double somaNd = res[0];
            if (somaNd < 0.0d) {
                xu = xLn;
                fu = somaNd;
            } else {
                x0 = xLn;
                f0 = somaNd;
            }
            if ((Math.abs((xLn - this.xAnterior) / Math.max(xLn, this.xAnterior)) < erroX) & (Math.abs(somaNd) < erroNd)) {
                stop3 = true;
                fi = res[1];
                ecg = res[2];
            }
            if (cont >= nCont) {
                stop3 = true;
                System.out.println("Limite de iterações excedido: Somatório de esforço normal = " + Math.abs(somaNd) + " tf     x1=" + this.xAnterior + "     x2=" + xLn + " ecg=" + ecg);
                fi = res[1];
                ecg = res[2];
            }
            cont++;
            this.xAnterior = xLn;
        }
        double mrx = 0.0d;
        double mry = 0.0d;
        for (int i3 = 0; i3 < this.secaoC.size(); i3++) {
            double aci = this.secaoC.get(i3)[2];
            double xci = this.secaoC.get(i3)[0];
            double yci = this.secaoC.get(i3)[1];
            double ycRot = xyCRot.get(i3)[1];
            double eci = ecg + (ycRot * fi);
            mrx += ((fc(eci) * aci) * yci) / 100.0d;
            mry += ((fc(eci) * aci) * xci) / 100.0d;
        }
        for (int i4 = 0; i4 < this.secaoS.size(); i4++) {
            double asi = this.secaoS.get(i4)[2];
            double xsi = this.secaoS.get(i4)[0];
            double ysi = this.secaoS.get(i4)[1];
            double ysRot = xyAsRot.get(i4)[1];
            double esi = ecg + (ysRot * fi);
            mrx += ((fs(esi) * asi) * ysi) / 100.0d;
            mry += ((fs(esi) * asi) * xsi) / 100.0d;
        }
        mr[0] = -mry;
        mr[1] = mrx;
        return mr;
    }

    private double[] funcX(double xLn, double d, double yCMin, double yCMax, List<double[]> xyCRot, List<double[]> xyAsRot, double nd) {
        double somaNd = 0.0d;
        double fi = 0.0d;
        double ecg = 0.0d;
        if (xLn / d < this.ecu / (this.ecu + 10.0d)) {
            double ec = ((-10.0d) * xLn) / (d - xLn);
            fi = (-ec) / xLn;
            ecg = ec - (fi * yCMin);
        }
        if ((this.ecu / (this.ecu + 10.0d) <= xLn / d) & (xLn / (yCMax - yCMin) <= 1.0d)) {
            double ec2 = -this.ecu;
            fi = (-ec2) / xLn;
            ecg = ec2 - (fi * yCMin);
        }
        if (1.0d < xLn / (yCMax - yCMin)) {
            double ec3 = ((-this.ec2) * xLn) / (xLn - (((yCMax - yCMin) * (this.ecu - this.ec2)) / this.ecu));
            fi = (-ec3) / xLn;
            ecg = ec3 - (fi * yCMin);
        }
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            double yci = xyCRot.get(i)[1];
            double eci = ecg + (yci * fi);
            somaNd += fc(eci) * aci;
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            double ysi = xyAsRot.get(i2)[1];
            double esi = ecg + (ysi * fi);
            somaNd += fs(esi) * asi;
        }
        return new double[]{somaNd - nd, fi, ecg};
    }

    private List<double[]> rotacionaXY(List<double[]> coordenadas, double teta) {
        List<double[]> coordenadaRot = new ArrayList<>();
        for (int i = 0; i < coordenadas.size(); i++) {
            double[] coordenadaRotI = {(Math.cos(teta) * coordenadas.get(i)[0]) + (Math.sin(teta) * coordenadas.get(i)[1]), ((-Math.sin(teta)) * coordenadas.get(i)[0]) + (Math.cos(teta) * coordenadas.get(i)[1])};
            coordenadaRot.add(coordenadaRotI);
        }
        return coordenadaRot;
    }

    private double[] momExt(double e) {
        double mrx = 0.0d;
        double mry = 0.0d;
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            double xci = this.secaoC.get(i)[0];
            double yci = this.secaoC.get(i)[1];
            mrx += ((fc(e) * aci) * yci) / 100.0d;
            mry += ((fc(e) * aci) * xci) / 100.0d;
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            double xsi = this.secaoS.get(i2)[0];
            double ysi = this.secaoS.get(i2)[1];
            mrx += ((fs(e) * asi) * ysi) / 100.0d;
            mry += ((fs(e) * asi) * xsi) / 100.0d;
        }
        return new double[]{-mry, mrx};
    }

    public double fc(double ec) {
        double fc = 0.0d;
        if (this.tipoCurvaC == 0) {
            if (((-this.ec2) < ec) & (ec < 0.0d)) {
                fc = (-0.85d) * this.fcd * (1.0d - Math.pow(1.0d + (ec / this.ec2), this.n));
            }
            if (((-this.ecu) * 1.0001d <= ec) & (ec <= (-this.ec2))) {
                fc = (-0.85d) * this.fcd;
            }
            if (ec < (-this.ecu) * 1.0001d) {
                System.out.println("ERRO: ec=" + ec + "<-" + this.ecu);
            }
        }
        return fc;
    }

    public double fs(double es) {
        double fs = 0.0d;
        if (Math.abs(es) < (this.fyd / this.moduloS) * 1000.0d) {
            fs = ((es * this.fyd) / ((this.fyd / this.moduloS) * 1000.0d)) - fc(es);
        }
        if (((this.fyd / this.moduloS) * 1000.0d <= Math.abs(es)) & (Math.abs(es) <= 10.1d)) {
            fs = ((this.fyd * es) / Math.abs(es)) - fc(es);
        }
        if (Math.abs(es) > 10.1d) {
            System.out.println("ERRO: es= " + es + ">10.0");
        }
        return fs;
    }
}
