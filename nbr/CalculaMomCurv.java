package pcalc;

import java.util.ArrayList;
import java.util.List;

/* loaded from: CalculaMomCurv.class */
public class CalculaMomCurv {
    public CalculaMomCurv(Dados dados2) {
        List<List<double[]>> momCurvX1 = new ArrayList<>();
        List<List<double[]>> momCurvX2 = new ArrayList<>();
        List<List<double[]>> momCurvY1 = new ArrayList<>();
        List<List<double[]>> momCurvY2 = new ArrayList<>();
        List<List<double[]>> momCurvX1GamaF3 = new ArrayList<>();
        List<List<double[]>> momCurvX2GamaF3 = new ArrayList<>();
        List<List<double[]>> momCurvY1GamaF3 = new ArrayList<>();
        List<List<double[]>> momCurvY2GamaF3 = new ArrayList<>();
        List<double[]> eiSecX1 = new ArrayList<>();
        List<double[]> eiSecX2 = new ArrayList<>();
        List<double[]> eiSecY1 = new ArrayList<>();
        List<double[]> eiSecY2 = new ArrayList<>();
        for (int i = 0; i < dados2.esforcos.getListaEsforcos().size(); i++) {
            if (dados2.erros.getListaErroNrd(i) == null) {
                double nsdI = dados2.esforcos.getListaEsforcos().get(i)[0] * dados2.config.getGamaF();
                List<double[]> momRotX1I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 0.0d, 1.0d, 0.85d);
                List<double[]> momRotX2I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 3.141592653589793d, 1.0d, 0.85d);
                List<double[]> momRotY1I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 1.5707963267948966d, 1.0d, 0.85d);
                List<double[]> momRotY2I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 4.71238898038469d, 1.0d, 0.85d);
                List<double[]> momRotX1GamaF3I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 0.0d, dados2.config.getGamaF3(), 1.1d);
                List<double[]> momRotX2GamaF3I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 3.141592653589793d, dados2.config.getGamaF3(), 1.1d);
                List<double[]> momRotY1GamaF3I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 1.5707963267948966d, dados2.config.getGamaF3(), 1.1d);
                List<double[]> momRotY2GamaF3I = new CurvaMrRotEixos().CurvaMrRotEixos(dados2, nsdI, 4.71238898038469d, dados2.config.getGamaF3(), 1.1d);
                momCurvX1.add(momRotX1I);
                momCurvX2.add(momRotX2I);
                momCurvY1.add(momRotY1I);
                momCurvY2.add(momRotY2I);
                momCurvX1GamaF3.add(momRotX1GamaF3I);
                momCurvX2GamaF3.add(momRotX2GamaF3I);
                momCurvY1GamaF3.add(momRotY1GamaF3I);
                momCurvY2GamaF3.add(momRotY2GamaF3I);
                eiSecX1.add(CalculaEIAprox(momRotX1GamaF3I, new CurvaMrRotEixos().CalculaMu(dados2, nsdI, 0.0d) / dados2.config.getGamaF3()));
                eiSecX2.add(CalculaEIAprox(momRotX2GamaF3I, new CurvaMrRotEixos().CalculaMu(dados2, nsdI, 3.141592653589793d) / dados2.config.getGamaF3()));
                eiSecY1.add(CalculaEIAprox(momRotY1GamaF3I, new CurvaMrRotEixos().CalculaMu(dados2, nsdI, 1.5707963267948966d) / dados2.config.getGamaF3()));
                eiSecY2.add(CalculaEIAprox(momRotY2GamaF3I, new CurvaMrRotEixos().CalculaMu(dados2, nsdI, 4.71238898038469d) / dados2.config.getGamaF3()));
            } else {
                momCurvX1.add(null);
                momCurvX2.add(null);
                momCurvY1.add(null);
                momCurvY2.add(null);
                momCurvX1GamaF3.add(null);
                momCurvX2GamaF3.add(null);
                momCurvY1GamaF3.add(null);
                momCurvY2GamaF3.add(null);
                eiSecX1.add(null);
                eiSecX2.add(null);
                eiSecY1.add(null);
                eiSecY2.add(null);
            }
        }
        Object[] momCurv = {momCurvX1, momCurvX2, momCurvY1, momCurvY2, momCurvX1GamaF3, momCurvX2GamaF3, momCurvY1GamaF3, momCurvY2GamaF3};
        dados2.resultados.setMomCurv(momCurv);
        dados2.resultados.setEiSecX1(eiSecX1);
        dados2.resultados.setEiSecX2(eiSecX2);
        dados2.resultados.setEiSecY1(eiSecY1);
        dados2.resultados.setEiSecY2(eiSecY2);
    }

    private double[] CalculaEIAprox(List<double[]> momRotGamaF3I, double mi) {
        double eiAprox = 0.0d;
        double fi = 0.0d;
        for (int j = 0; j < momRotGamaF3I.size() - 1; j++) {
            double m1 = momRotGamaF3I.get(j)[0];
            double m2 = momRotGamaF3I.get(j + 1)[0];
            double fi1 = momRotGamaF3I.get(j)[2];
            double fi2 = momRotGamaF3I.get(j + 1)[2];
            if ((Math.abs(m1) < Math.abs(mi)) & (Math.abs(mi) <= Math.abs(m2))) {
                double fiI = (((mi - m1) * (fi2 - fi1)) / (m2 - m1)) + fi1;
                eiAprox = mi / fiI;
                fi = fiI;
            }
        }
        return new double[]{eiAprox, mi, fi};
    }
}
