package it.aldolushkja.utils.rest;

import it.aldolushkja.utils.interceptor.Loggable;
import it.aldolushkja.utils.service.DigestFactory;
import java.util.UUID;
import javax.inject.Inject;
import javax.validation.constraints.Size;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.MediaType;

import org.slf4j.Logger;

@Path("/strings")
@Loggable
public class StringsResource {

  private static final String ERROR_MSG = "Fullfill the request with [ ?text=<what you want> ]";

  @Inject
  Logger log;

  @Inject
  DigestFactory factory;

  @GET
  @Path("/uuid")
  @Produces(MediaType.TEXT_PLAIN)
  public String getRandomUUID() {
    String output = UUID.randomUUID().toString();
    log.info("StringsResource.getRandomUUID() ---- output " + output);
    return output;
  }

  @GET
  @Path("/sha1")
  @Produces(MediaType.TEXT_PLAIN)
  public String getSha1(
      @QueryParam("text") @Size(min = 5, max = 100, message = "Testo deve essere compreso tra 5 e 100 caratteri") String text) {
    if (text == null || text.trim().isEmpty()) {
      return ERROR_MSG;
    }
    return factory.getSha1(text);
  }

  @GET
  @Path("/sha256")
  @Produces(MediaType.TEXT_PLAIN)
  public String getSha256(@QueryParam("text") String text) {
    if (text == null || text.trim().isEmpty()) {
      return ERROR_MSG;
    }
    return factory.getSha256(text);
  }


  @GET
  @Path("/base64/encode")
  @Produces(MediaType.TEXT_PLAIN)
  public String encodeBase64(@QueryParam("text") String text) {
    if (text == null || text.trim().isEmpty()) {
      return ERROR_MSG;
    }
    return factory.encodeWithBase64(text);
  }

  @GET
  @Path("/base64/decode")
  @Produces(MediaType.TEXT_PLAIN)
  public String decodeBase64(@QueryParam("text") String text) {
    if (text == null || text.trim().isEmpty()) {
      return ERROR_MSG;
    }
    return factory.decodeBase64(text);
  }

  @GET
  @Path("/sha512")
  @Produces(MediaType.TEXT_PLAIN)
  public String getSha512(@QueryParam("text") String text) {
    if (text == null || text.trim().isEmpty()) {
      return ERROR_MSG;
    }
    return factory.getSha512(text);
  }

}
