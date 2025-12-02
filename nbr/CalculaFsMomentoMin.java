package pcalc;

import java.util.ArrayList;
import java.util.List;

/* loaded from: CalculaFsMomentoMin.class */
public class CalculaFsMomentoMin {
    public CalculaFsMomentoMin(Dados dados2) {
        List<double[]> momentoMin = dados2.resultados.getMomentoMin();
        List<double[][]> curvasMr = dados2.resultados.getCurvasMr();
        int combFsMin = dados2.resultados.getCombFsMin();
        double fsMin = dados2.resultados.getFsMin();
        for (int i = 0; i < momentoMin.size(); i++) {
            double msxMinI = momentoMin.get(i)[0];
            double msyMinI = momentoMin.get(i)[1];
            double msx2MinI = momentoMin.get(i)[2];
            double msy2MinI = momentoMin.get(i)[3];
            if (msy2MinI != 0.0d) {
                List<Double> listMrxMinI = new ArrayList<>();
                List<Double> listMryMinI = new ArrayList<>();
                for (int j = 0; j < 50; j++) {
                    double x1 = (-msx2MinI) + (((j * 2) * msx2MinI) / 49.0d);
                    double y1 = Math.sqrt(Math.abs(msy2MinI * msy2MinI * (1.0d - (((x1 * x1) / msx2MinI) / msx2MinI))));
                    listMrxMinI.add(Double.valueOf(x1));
                    listMryMinI.add(Double.valueOf(y1));
                }
                for (int j2 = 1; j2 < 49; j2++) {
                    double x12 = msx2MinI - (((j2 * 2) * msx2MinI) / 48.0d);
                    double y12 = -Math.sqrt(Math.abs(msy2MinI * msy2MinI * (1.0d - (((x12 * x12) / msx2MinI) / msx2MinI))));
                    listMrxMinI.add(Double.valueOf(x12));
                    listMryMinI.add(Double.valueOf(y12));
                }
                double fsI = 1.0E10d;
                for (int j3 = 0; j3 < listMrxMinI.size(); j3++) {
                    double x = 0.0d;
                    double y = 0.0d;
                    double dist = 1.0E10d;
                    double msxd = listMrxMinI.get(j3).doubleValue();
                    double msyd = listMryMinI.get(j3).doubleValue();
                    if ((msxd != 0.0d) | (msyd != 0.0d)) {
                        msxd = msxd == 0.0d ? 1.0E-9d : msxd;
                        msyd = msyd == 0.0d ? 1.0E-9d : msyd;
                        double m = msxd / msyd;
                        for (int k = 0; k < curvasMr.get(0)[0].length - 1; k++) {
                            double x13 = curvasMr.get(i)[2][k];
                            double x2 = curvasMr.get(i)[2][k + 1];
                            double y13 = curvasMr.get(i)[3][k];
                            double y2 = curvasMr.get(i)[3][k + 1];
                            double xj = ((x2 * y13) - (x13 * y2)) / (((y13 - y2) + (x2 * m)) - (x13 * m));
                            double yj = m * xj;
                            if ((msyd * xj > 0.0d) & (msxd * yj > 0.0d)) {
                                double distI = Math.sqrt((xj * xj) + (yj * yj));
                                if (dist > distI) {
                                    dist = distI;
                                    x = xj;
                                    y = yj;
                                }
                            }
                        }
                    }
                    if (!(curvasMr.get(i)[2][0] != 0.0d) && !(curvasMr.get(i)[3][0] != 0.0d)) {
                        fsI = 0.0d;
                    } else if ((msxd != 0.0d) | (msyd != 0.0d)) {
                        fsI = Math.floor(Math.min(fsI, Math.sqrt((x * x) + (y * y)) / Math.sqrt((msyd * msyd) + (msxd * msxd))) * 100.0d) / 100.0d;
                    } else {
                        fsI = 1.0E10d;
                    }
                    if (fsMin > fsI) {
                        fsMin = fsI;
                        combFsMin = i;
                    }
                }
                momentoMin.set(i, new double[]{msxMinI, msyMinI, msx2MinI, msy2MinI, fsI});
            } else if (dados2.config.getLimMomentoMin()) {
                fsMin = 0.0d;
                combFsMin = i;
                momentoMin.set(i, new double[]{msxMinI, msyMinI, msx2MinI, msy2MinI, 1.0d});
            }
        }
        dados2.resultados.setFsMi(fsMin);
        dados2.resultados.setCombFsMi(combFsMin);
        dados2.resultados.setMomentoMin(momentoMin);
    }
}
