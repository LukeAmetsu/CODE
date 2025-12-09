package pcalc;

import java.util.ArrayList;
import java.util.List;

/* loaded from: CurvaMrRotEixos.class */
public class CurvaMrRotEixos {

    /* renamed from: dados, reason: collision with root package name */
    private Dados f2dados;
    private double yCMin;
    private double yCMax;
    private double yAsMax;
    private double d;
    private double fyd;
    private double fcd;
    private double betaC;
    private double moduloS;
    private double ec2;
    private double ecu;
    private double n;
    private List<double[]> secaoC = new ArrayList();
    private List<double[]> secaoS = new ArrayList();
    private List<double[]> xyCRot = new ArrayList();
    private List<double[]> xyAsRot = new ArrayList();
    private double nd = 0.0d;

    public List<double[]> CurvaMrRotEixos(Dados dados2, double nd, double tetaLN, double gamaF3, double betaC) {
        this.nd = nd / gamaF3;
        List<double[]> mRot = new ArrayList<>();
        this.f2dados = dados2;
        if (dados2.config.getFck() <= 0.5d) {
            this.n = 2.0d;
            this.ec2 = 2.0d;
            this.ecu = 3.5d;
        } else {
            this.n = 1.4d + (23.4d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
            this.ec2 = Math.min(2.0d + (0.085d * Math.pow((100.0d * dados2.config.getFck()) - 50.0d, 0.53d)), 2.6d);
            this.ecu = 2.6d + (35.0d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
        }
        this.betaC = betaC;
        this.fyd = dados2.config.getFyk() / dados2.config.getGamaS();
        this.fcd = dados2.config.getFck() / dados2.config.getGamaC();
        this.moduloS = dados2.config.getModEs();
        if ((dados2.config.getConsiderarFluencia() == 1) | ((dados2.config.getConsiderarFluencia() == 2) & (dados2.secao.getLambdaMax() > 90))) {
            double coefFeq = dados2.config.getCoefF();
            this.ec2 *= 1.0d + coefFeq;
            this.ecu *= 1.0d + coefFeq;
        }
        this.secaoC = dados2.resultados.getSecaoC();
        this.secaoS = dados2.resultados.getSecaoS();
        this.xyCRot = rotacionaXY(this.secaoC, tetaLN);
        this.xyAsRot = rotacionaXY(this.secaoS, tetaLN);
        this.yCMin = 1.0E11d;
        this.yCMax = -1.0E11d;
        this.yAsMax = -1.0E11d;
        for (int i = 0; i < this.xyCRot.size(); i++) {
            this.yCMin = Math.min(this.xyCRot.get(i)[1], this.yCMin);
            this.yCMax = Math.max(this.xyCRot.get(i)[1], this.yCMax);
        }
        for (int i2 = 0; i2 < this.xyAsRot.size(); i2++) {
            this.yAsMax = Math.max(this.xyAsRot.get(i2)[1], this.yAsMax);
        }
        this.d = this.yAsMax - this.yCMin;
        double[] ndLim = calculaNdLim();
        if ((ndLim[0] <= nd) & (nd <= ndLim[1])) {
            double ecMin = calculaEcMin(nd);
            double nEc = 1.0d;
            double nEcMax = dados2.config.getNGraficoMomCurv();
            double[] dArr = {0.0d, 0.0d, 0.0d, 0.0d, 0.0d, 0.0d};
            double d = -this.ecu;
            double[] mRot0 = calculaMrd(-this.ecu, 0.0d, 0.0d, nd);
            if (mRot0[4] > 10.0d) {
                mRot0 = calculaMrd(0.0d, 10.0d, 0.0d, nd);
                double d2 = mRot0[3];
            }
            if (mRot0[5] < (-this.ec2)) {
                double d3 = calculaMrd(0.0d, 0.0d, -this.ec2, nd)[3];
            }
            double[] mRotI = {calculaM0(ecMin), ecMin, 0.0d, ecMin, ecMin, ecMin};
            mRot.add(mRotI);
            while (true) {
                if (!((mRotI[3] > (-this.ecu)) & (mRotI[4] < 10.0d) & (mRotI[5] > (-this.ec2))) || !(nEc <= nEcMax)) {
                    break;
                }
                mRotI = calculaMrd(ecMin + ((((-this.ecu) - ecMin) * nEc) / nEcMax), 0.0d, 0.0d, nd);
                if (mRotI[4] > 10.0d) {
                    mRotI = calculaMrd(0.0d, 10.0d, 0.0d, nd);
                }
                if (mRotI[5] < (-this.ec2)) {
                    mRotI = calculaMrd(0.0d, 0.0d, -this.ec2, nd);
                }
                if ((mRotI[3] >= (-this.ecu)) & (mRotI[4] <= 10.0d) & (mRotI[5] >= (-this.ec2))) {
                    mRot.add(mRotI);
                }
                nEc += 1.0d;
            }
        }
        return mRot;
    }

    public double CalculaMu(Dados dados2, double nd, double tetaLN) {
        this.nd = nd;
        this.f2dados = dados2;
        if (dados2.config.getFck() <= 0.5d) {
            this.n = 2.0d;
            this.ec2 = 2.0d;
            this.ecu = 3.5d;
        } else {
            this.n = 1.4d + (23.4d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
            this.ec2 = Math.min(2.0d + (0.085d * Math.pow((100.0d * dados2.config.getFck()) - 50.0d, 0.53d)), 2.6d);
            this.ecu = 2.6d + (35.0d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
        }
        this.betaC = 0.85d;
        this.fyd = dados2.config.getFyk() / dados2.config.getGamaS();
        this.fcd = dados2.config.getFck() / dados2.config.getGamaC();
        this.moduloS = dados2.config.getModEs();
        this.secaoC = dados2.resultados.getSecaoC();
        this.secaoS = dados2.resultados.getSecaoS();
        this.xyCRot = rotacionaXY(this.secaoC, tetaLN);
        this.xyAsRot = rotacionaXY(this.secaoS, tetaLN);
        this.yCMin = 1.0E11d;
        this.yCMax = -1.0E11d;
        this.yAsMax = -1.0E11d;
        for (int i = 0; i < this.xyCRot.size(); i++) {
            this.yCMin = Math.min(this.xyCRot.get(i)[1], this.yCMin);
            this.yCMax = Math.max(this.xyCRot.get(i)[1], this.yCMax);
        }
        for (int i2 = 0; i2 < this.xyAsRot.size(); i2++) {
            this.yAsMax = Math.max(this.xyAsRot.get(i2)[1], this.yAsMax);
        }
        this.d = this.yAsMax - this.yCMin;
        double[] dArr = {0.0d, 0.0d, 0.0d, 0.0d, 0.0d, 0.0d};
        double[] mRotU = calculaMrd(-this.ecu, 0.0d, 0.0d, nd);
        if (mRotU[4] > 10.0d) {
            mRotU = calculaMrd(0.0d, 10.0d, 0.0d, nd);
        }
        if (mRotU[5] < (-this.ec2)) {
            mRotU = calculaMrd(0.0d, 0.0d, -this.ec2, nd);
        }
        return mRotU[0];
    }

    private double[] calculaMrd(double ec, double es, double e37, double nd) {
        double[] mRot = new double[6];
        double xMin = -this.d;
        double xMax = 2.0d * this.d;
        boolean stop = false;
        double erroX = this.f2dados.config.getTolVarLn();
        double erroNd = this.f2dados.config.getTolSomaN();
        int cont = 0;
        int nCont = this.f2dados.config.getTolIt();
        double xAnterior = 0.0d;
        double ecg = 0.0d;
        double fi = 0.0d;
        while (!stop) {
            double xLn = (xMin + xMax) / 2.0d;
            double[] res = funcX(xLn, ec, es, e37);
            double somaNd = res[0];
            fi = res[1];
            ecg = res[2];
            if (somaNd < 0.0d) {
                if (xLn > 0.0d) {
                    xMax = xLn;
                } else if (es == 0.0d) {
                    xMin = xLn;
                } else {
                    xMax = xLn;
                    xMin = 2.0d * xMin;
                }
            } else if (xLn > 0.0d) {
                xMin = xLn;
                if (xLn / this.d >= 1.0d) {
                    xMax = 2.0d * xMax;
                }
            } else if (es == 0.0d) {
                xMax = xLn;
                xMin = 2.0d * xMin;
            } else {
                xMin = xLn;
            }
            if ((Math.abs((xLn - xAnterior) / Math.max(xLn, xAnterior)) < erroX) | (Math.abs(somaNd) < erroNd)) {
                stop = true;
            }
            if (cont >= nCont) {
                stop = true;
                System.out.println("Limite de iterações excedido: Somatório de esforço normal = " + Math.abs(somaNd) + " tf     x1=" + xAnterior + "     x2=" + xLn + " ecg=" + ecg);
            }
            cont++;
            xAnterior = xLn;
        }
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            double yci = this.xyCRot.get(i)[1];
            double eci = ecg + (yci * fi);
            mRot[0] = mRot[0] + (((fc(eci) * aci) * yci) / 100.0d);
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            double ysi = this.xyAsRot.get(i2)[1];
            double esi = ecg + (ysi * fi);
            mRot[0] = mRot[0] + (((fs(esi) * asi) * ysi) / 100.0d);
        }
        mRot[1] = ecg;
        mRot[2] = fi * 100.0d;
        mRot[3] = ecg + (this.yCMin * fi);
        mRot[4] = ecg + (this.yAsMax * fi);
        mRot[5] = ecg + ((this.yCMin + (((this.yCMax - this.yCMin) * (this.ecu - this.ec2)) / this.ecu)) * fi);
        return mRot;
    }

    private double[] funcX(double xLn, double ec, double es, double e37) {
        double somaNd = 0.0d;
        double fi = 0.0d;
        double ecg = 0.0d;
        if (ec != 0.0d) {
            fi = (-ec) / xLn;
            ecg = ec - (fi * this.yCMin);
        }
        if (es != 0.0d) {
            double ec2 = ((-es) * xLn) / (this.d - xLn);
            fi = (-ec2) / xLn;
            ecg = ec2 - (fi * this.yCMin);
        }
        if (e37 != 0.0d) {
            double ec3 = (e37 * xLn) / (xLn - (((this.yCMax - this.yCMin) * (this.ecu - this.ec2)) / this.ecu));
            fi = (-ec3) / xLn;
            ecg = ec3 - (fi * this.yCMin);
        }
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            double yci = this.xyCRot.get(i)[1];
            double eci = ecg + (yci * fi);
            somaNd += fc(eci) * aci;
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            double ysi = this.xyAsRot.get(i2)[1];
            double esi = ecg + (ysi * fi);
            somaNd += fs(esi) * asi;
        }
        return new double[]{somaNd - this.nd, fi, ecg};
    }

    private List<double[]> rotacionaXY(List<double[]> coordenadas, double teta) {
        List<double[]> coordenadaRot = new ArrayList<>();
        for (int i = 0; i < coordenadas.size(); i++) {
            double[] coordenadaRotI = {(Math.cos(teta) * coordenadas.get(i)[0]) + (Math.sin(teta) * coordenadas.get(i)[1]), ((-Math.sin(teta)) * coordenadas.get(i)[0]) + (Math.cos(teta) * coordenadas.get(i)[1])};
            coordenadaRot.add(coordenadaRotI);
        }
        return coordenadaRot;
    }

    public double fc(double ec) {
        double fc = 0.0d;
        if (((-this.ec2) < ec) & (ec < 0.0d)) {
            fc = (-this.betaC) * this.fcd * (1.0d - Math.pow(1.0d + (ec / this.ec2), this.n));
        }
        if (ec <= (-this.ec2)) {
            fc = (-this.betaC) * this.fcd;
        }
        return fc;
    }

    public double fs(double es) {
        double fs = 0.0d;
        if (Math.abs(es) < (this.fyd / this.moduloS) * 1000.0d) {
            fs = ((es * this.fyd) / ((this.fyd / this.moduloS) * 1000.0d)) - fc(es);
        }
        if ((this.fyd / this.moduloS) * 1000.0d <= Math.abs(es)) {
            fs = ((this.fyd * es) / Math.abs(es)) - fc(es);
        }
        return fs;
    }

    private double calculaEcMin(double nd) {
        double ecMin = -this.ecu;
        double ecMax = 10.0d;
        boolean stop = false;
        double erroNd = this.f2dados.config.getTolSomaN();
        int cont = 0;
        int nCont = this.f2dados.config.getTolIt();
        double eci = 0.0d;
        if (nd != 0.0d) {
            while (!stop) {
                double somaNd = 0.0d;
                eci = (ecMin + ecMax) / 2.0d;
                for (int i = 0; i < this.secaoC.size(); i++) {
                    double aci = this.secaoC.get(i)[2];
                    somaNd += fc(eci) * aci;
                }
                for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
                    double asi = this.secaoS.get(i2)[2];
                    somaNd += fs(eci) * asi;
                }
                double somaNd2 = somaNd - nd;
                if (somaNd2 < 0.0d) {
                    ecMin = eci;
                } else {
                    ecMax = eci;
                }
                if (Math.abs(somaNd2) < erroNd) {
                    stop = true;
                }
                if (cont >= nCont) {
                    stop = true;
                    System.out.println("ecMin: Limite de iterações excedido: Somatório de esforço normal = " + Math.abs(somaNd2) + " tf ");
                }
                cont++;
            }
        }
        return eci;
    }

    private double[] calculaNdLim() {
        double ndMax = 0.0d;
        double ndMin = 0.0d;
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            ndMin += fc(-this.ec2) * aci;
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            ndMin += fs(-this.ec2) * asi;
            ndMax += fs(10.0d) * asi;
        }
        return new double[]{ndMin, ndMax};
    }

    private double calculaM0(double e) {
        double m0 = 0.0d;
        for (int i = 0; i < this.secaoC.size(); i++) {
            double aci = this.secaoC.get(i)[2];
            double yci = this.xyCRot.get(i)[1];
            m0 += ((fc(e) * aci) * yci) / 100.0d;
        }
        for (int i2 = 0; i2 < this.secaoS.size(); i2++) {
            double asi = this.secaoS.get(i2)[2];
            double ysi = this.xyAsRot.get(i2)[1];
            m0 += ((fs(e) * asi) * ysi) / 100.0d;
        }
        return m0;
    }
}
